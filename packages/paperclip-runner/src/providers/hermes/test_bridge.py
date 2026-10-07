import asyncio
import json
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from acp.schema import ClientCapabilities
from bridge import ManagedHermesACPAgent, ManagedSessionManager, ChannelClient, native_answers, question_set, install_no_auth_transport, turn_usage, USAGE_COUNTERS
from policy import authorize_tool


class Accounting(unittest.TestCase):
    def test_usage_is_per_turn_and_cache_and_thought_are_not_double_counted(self):
        before = dict.fromkeys(USAGE_COUNTERS, 100)
        after = {key: value + 5 for key, value in before.items()}
        result = turn_usage(before, after, [True, True])
        self.assertEqual(result.input_tokens, 5)
        self.assertEqual(result.cached_read_tokens, 5)
        self.assertEqual(result.cached_write_tokens, 5)
        self.assertEqual(result.thought_tokens, 0)
        self.assertIsNone(turn_usage(before, after, [True, False]))
        self.assertIsNone(turn_usage(before, after, []))
        with self.assertRaises(ValueError):
            turn_usage(after, before, [True])


class ToolPolicy(unittest.TestCase):
    def test_planning_can_report_and_use_only_authoritative_assigned_reads(self):
        policy = {"permissionMode": "approve-reads", "readOnly": True,
                  "paperclipReadTools": ["mcp__paperclip__read_document"]}
        for name in ["mcp__paperclip__paperclip_finish", "mcp__paperclip__read_document", "todo_list"]:
            self.assertTrue(authorize_tool(name, {}, policy=policy, cwd="/workspace"))
        for name in ["mcp__other__read_document", "mcp__paperclip__manage_routine", "mcp__paperclip__unknown_read"]:
            with self.assertRaises(PermissionError):
                authorize_tool(name, {}, policy=policy, cwd="/workspace")

    def test_planning_disallows_commands_writes_and_unassigned_read_roots(self):
        policy = {"permissionMode": "approve-all", "readOnly": True, "protectedPaths": ["/private/runtime"], "readRoots": []}
        for name, args in [("terminal", {"command": "touch x"}), ("write_file", {"path": "x"}), ("read_file", {"path": "/private/runtime/auth.json"}), ("read_file", {"path": "/other/secret"})]:
            with self.assertRaises(PermissionError):
                authorize_tool(name, args, policy=policy, cwd="/workspace")
        self.assertTrue(authorize_tool("read_file", {"path": "a.txt"}, policy=policy, cwd="/workspace"))

    def test_scheduler_and_protected_ancestors_are_denied_in_full_auto(self):
        policy = {"permissionMode": "approve-all", "readOnly": False, "protectedPaths": ["/workspace/runtime"]}
        for name, args in [("cronjob", {}), ("send_message", {}), ("write_file", {"path": "/workspace"}), ("write_file", {"path": "/skills/a"})]:
            with self.assertRaises(PermissionError):
                authorize_tool(name, args, policy=policy, cwd="/workspace", assigned_skills=["/skills"])


class Questions(unittest.TestCase):
    def test_batches_preserve_native_question_ids_and_multiple_answers(self):
        form = question_set(None, questions=[
            {"qid": "q0", "question": "Which?", "choices": ["A", "B"], "multi_select": True},
            {"qid": "q1", "question": "Why?"},
        ])
        result = native_answers(form, {"outcome": "answered", "answers": {
            "q0": {"selectedOptionIds": ["o1", "o0"], "customText": "C"}, "q1": {"text": "Because"},
        }}, True)
        self.assertEqual(result, {"answers": {"q0": ["B", "A", "C"], "q1": "Because"}})

    def test_rejects_incomplete_or_unknown_answers(self):
        form = question_set("Which?", ["A"])
        for answers in ({}, {"q0": {"selectedOptionIds": ["missing"]}}, {"q0": {}}):
            with self.assertRaises(ValueError):
                native_answers(form, {"outcome": "answered", "answers": answers}, False)
        self.assertIsNone(native_answers(form, {"outcome": "cancelled"}, False))


class Restore(unittest.TestCase):
    def test_missing_or_failed_history_never_becomes_an_empty_success(self):
        manager = ManagedSessionManager(agent_factory=lambda: SimpleNamespace())
        db = Mock()
        db.get_compression_tip.return_value = "session"
        manager._get_db = lambda: db
        for row, history in [(None, []), ({"source": "cli"}, []), ({"source": "acp"}, [])]:
            db.get_session.return_value = row
            db.get_messages_as_conversation.return_value = history
            with self.assertRaises(ValueError):
                manager._restore("session")
        db.get_session.return_value = {"source": "acp"}
        db.get_messages_as_conversation.side_effect = OSError("damaged database")
        with self.assertRaises(OSError):
            manager._restore("session")

    def test_compaction_restores_the_native_head_under_the_stable_acp_handle(self):
        manager = ManagedSessionManager(agent_factory=lambda: SimpleNamespace())
        db = Mock()
        manager._get_db = lambda: db
        db.get_compression_tip.return_value = "child"
        db.get_compression_chain.return_value = ["parent", "child"]
        db.get_session.side_effect = lambda identity: {"source": "acp", "model": "test",
            "end_reason": "compression" if identity == "parent" else None,
            "model_config": json.dumps({"cwd": "/workspace", "paperclip_head": "child"})}
        db.get_messages_as_conversation.return_value = [{"role": "user", "content": "compacted summary"}]
        manager._make_agent = Mock(return_value=SimpleNamespace(model="test"))
        state = manager._restore("parent")
        self.assertEqual(state.session_id, "parent")
        self.assertEqual(manager._make_agent.call_args.kwargs["session_id"], "child")
        db.get_messages_as_conversation.assert_called_once_with("child", repair_alternation=True)
        db.get_compression_tip.return_value = "parent"
        with self.assertRaisesRegex(ValueError, "compacted session history is missing"):
            manager._restore("parent")

    def test_restore_accepts_sdk_base_url_normalization_but_rejects_routing_changes(self):
        manager = ManagedSessionManager()
        config = {"model": {"provider": "custom:paperclip", "default": "exact-model"}}
        route = {"provider": "custom:paperclip", "base_url": "https://example.test/v1?route=a", "api_mode": "chat_completions"}
        agent = SimpleNamespace()
        with patch("hermes_cli.config.load_config", return_value=config), patch("hermes_cli.runtime_provider.resolve_runtime_provider", return_value=route), patch("acp_adapter.session.SessionManager._make_agent", return_value=agent) as native:
            manager._make_agent(model="exact-model", base_url="https://example.test/v1/?route=a", api_mode="chat_completions")
            native.assert_called_once()
            for change in [{"model": "other"}, {"base_url": "https://example.test/v2?route=a"}, {"base_url": "https://example.test/v1?route=b"}, {"requested_provider": "other"}, {"api_mode": "responses"}]:
                native.reset_mock()
                with self.assertRaises(ValueError):
                    manager._make_agent(**{"model": "exact-model", "base_url": route["base_url"], "api_mode": "chat_completions", **change})
                native.assert_not_called()

    def test_failed_native_flush_cannot_be_reported_as_durable(self):
        db = Mock()
        manager = ManagedSessionManager(db=db)
        manager._get_db = lambda: db
        agent = SimpleNamespace(_session_db=db, session_id="head", _flush_messages_to_session_db=Mock(return_value=False))
        with self.assertRaisesRegex(ValueError, "could not be saved"):
            manager._persist(SimpleNamespace(history=[{"role": "user", "content": "x"}], agent=agent, session_id="head"))
        db.update_session_meta.assert_not_called()


class Controls(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.state = SimpleNamespace(runtime_lock=threading.Lock(), is_running=True,
                                     cancel_event=threading.Event(), agent=Mock())
        self.manager = Mock()
        self.manager.get_session.return_value = self.state
        self.bridge = ManagedHermesACPAgent(self.manager)
        self.bridge._negotiated = True
        self.bridge._active = ("session", "turn")

    async def test_steering_is_bound_to_live_session_and_turn(self):
        for session, token in [("other", "turn"), ("session", "old")]:
            response = await self.bridge.ext_method("hermes/steer", {
                "version": 1, "sessionId": session, "turnToken": token, "message": "Change direction",
            })
            self.assertFalse(response["accepted"])
        self.state.agent.redirect.assert_not_called()
        self.state.agent.redirect.return_value = True
        response = await self.bridge.ext_method("hermes/steer", {
            "version": 1, "sessionId": "session", "turnToken": "turn", "message": "Change direction",
        })
        self.assertTrue(response["accepted"])
        self.state.agent.redirect.assert_called_once_with("Change direction")
        self.state.cancel_event.set()
        response = await self.bridge.ext_method("hermes/steer", {
            "version": 1, "sessionId": "session", "turnToken": "turn", "message": "Too late",
        })
        self.assertFalse(response["accepted"])

    async def test_concurrent_prompt_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "queue work in Paperclip"):
            await self.bridge.prompt([], "session")

    async def test_overlapping_same_name_tools_complete_by_native_identity(self):
        callbacks = SimpleNamespace(tool_call_ids={}, tool_call_meta={})
        updates = []
        with patch("bridge.HermesACPAgent._wire_turn_callbacks", return_value=callbacks), patch("bridge._send_update", side_effect=lambda c, s, l, event: updates.append(event)):
            self.bridge._wire_turn_callbacks(self.state, "session", Mock(), asyncio.get_running_loop())
            self.state.agent.tool_start_callback("call-a", "read_file", {"path": "a.txt"})
            self.state.agent.tool_start_callback("call-b", "read_file", {"path": "b.txt"})
            self.state.agent.tool_complete_callback("call-b", "read_file", {"path": "b.txt"}, "B")
            self.state.agent.tool_complete_callback("call-a", "read_file", {"path": "a.txt"}, "A")
        self.assertEqual([u.tool_call_id for u in updates], ["call-a", "call-b", "call-b", "call-a"])
        self.assertEqual(callbacks.tool_call_ids, {})
        self.assertEqual(callbacks.tool_call_meta, {})

    async def test_capabilities_use_native_sdk_metadata(self):
        response = await self.bridge.initialize(client_capabilities=ClientCapabilities(
            field_meta={"paperclipHermes": {"version": 1}}))
        self.assertTrue(self.bridge._negotiated)
        self.assertEqual(response.agent_capabilities.field_meta["paperclipHermes"]["version"], 1)

    async def test_reasoning_and_text_have_distinct_native_message_ids(self):
        import acp
        client = SimpleNamespace(session_update=AsyncMock())
        wrapper = ChannelClient(client)
        thought = acp.update_agent_thought_text("Fixture reasoning")
        text = acp.update_agent_message_text("Fixture text")
        thought.message_id = text.message_id = "0496571a-3b77-42a6-ab45-71bd6b7593ab"
        await wrapper.session_update("session", thought)
        await wrapper.session_update("session", text)
        first, second = [c.args[1] for c in client.session_update.call_args_list]
        self.assertNotEqual(first.message_id, second.message_id)
        self.assertEqual(second.message_id, text.message_id)


class NoAuth(unittest.TestCase):
    def test_no_auth_omits_sdk_headers_and_metadata_probe_credentials(self):
        import openai
        import anthropic
        import httpx
        from agent import model_metadata
        classes = [openai.OpenAI, openai.AsyncOpenAI, anthropic.Anthropic, anthropic.AsyncAnthropic]
        original = [c.__init__ for c in classes]
        metadata = model_metadata._auth_headers
        requests = []
        try:
            install_no_auth_transport("http://127.0.0.1:9876/v1")
            with openai.OpenAI(base_url="http://127.0.0.1:9876/v1", api_key="no-key-required", http_client=httpx.Client(transport=httpx.MockTransport(
                lambda req: requests.append(req) or httpx.Response(200, json={"data": []})
            ))) as client:
                client.models.list()
            self.assertNotIn("Authorization", requests[0].headers)
            self.assertEqual(model_metadata._auth_headers("no-key-required"), {})
        finally:
            for cls, constructor in zip(classes, original):
                cls.__init__ = constructor
            model_metadata._auth_headers = metadata


if __name__ == "__main__":
    unittest.main()
