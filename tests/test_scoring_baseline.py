import asyncio
import unittest
from unittest.mock import patch

import server


class FakeDevice:
  def __init__(self):
    self.reset_count = 0

  async def send_reset(self):
    self.reset_count += 1


class FakeBleDevice:
  name = "Counter-Test"
  address = "ble-test"


class ScoringBaselineTests(unittest.TestCase):
  def make_referee(self, mode):
    referee = server.HeadlessReferee(1, "Judge A", mode, None)
    referee._broadcast_update = lambda message_type: None
    return referee

  def test_single_uses_primary_plus_and_minus_counts(self):
    referee = self.make_referee("SINGLE")

    referee._on_pri_data(cur=99, typ=1, p=4, m=1, ts=100)

    self.assertEqual(referee.score, {
      "total": 3,
      "plus": 4,
      "minus": 1,
      "penalty": 0,
    })

  def test_dual_compares_plus_counts_and_combines_major_penalties(self):
    referee = self.make_referee("DUAL")

    referee._on_pri_data(cur=2, typ=1, p=5, m=2, ts=100)
    referee._on_sec_data(cur=-1, typ=-1, p=3, m=4, ts=110)

    self.assertEqual(referee.score, {
      "total": 2,
      "plus": 5,
      "minus": 3,
      "penalty": 6,
    })

  def test_reset_clears_both_device_caches_and_sends_commands(self):
    referee = self.make_referee("DUAL")
    primary = FakeDevice()
    secondary = FakeDevice()
    referee.set_devices(primary, secondary)
    referee.pri_cache = [5, 2]
    referee.sec_cache = [3, 4]
    referee._update_score_state()

    asyncio.run(referee.reset())

    self.assertEqual(primary.reset_count, 1)
    self.assertEqual(secondary.reset_count, 1)
    self.assertEqual(referee.pri_cache, [0, 0])
    self.assertEqual(referee.sec_cache, [0, 0])
    self.assertEqual(referee.score, {
      "total": 0,
      "plus": 0,
      "minus": 0,
      "penalty": 0,
    })

  def test_recorded_history_keeps_each_arrival_snapshot(self):
    referee = self.make_referee("SINGLE")
    original_state = dict(server.match_state)
    server.match_state.update({
      "current_group": "Open",
      "current_contestant": "Alice",
      "config": {"mode": "TOURNAMENT", "media": {}},
    })
    history = []

    try:
      with patch.object(server.storage_manager, "log_event", side_effect=history.append):
        referee._on_pri_data(cur=1, typ=1, p=1, m=0, ts=100)
        referee._on_pri_data(cur=2, typ=1, p=2, m=0, ts=200)
        referee._on_pri_data(cur=1, typ=-1, p=2, m=1, ts=300)
    finally:
      server.match_state.clear()
      server.match_state.update(original_state)

    self.assertEqual(
      [(item.current_total, item.total_plus, item.total_minus) for item in history],
      [(1, 1, 0), (2, 2, 0), (1, 2, 1)],
    )
    self.assertEqual([item.ble_timestamp for item in history], [100, 200, 300])
    self.assertEqual(len({item.event_id for item in history}), 3)

  def test_active_disconnect_cancels_pending_ble_reconnect(self):
    async def scenario():
      statuses = []
      node = server.HeadlessDeviceNode(FakeBleDevice(), None, statuses.append)
      node._trigger_reconnect()
      reconnect_task = node._reconnect_task
      await asyncio.sleep(0)

      await node.disconnect()

      self.assertTrue(reconnect_task.cancelled())
      self.assertIsNone(node._reconnect_task)
      self.assertFalse(node.is_reconnecting)
      self.assertTrue(node.intentional_disconnect)
      self.assertEqual(statuses[-1], "disconnected")

    asyncio.run(scenario())

  def test_active_disconnect_cancels_pending_usb_reconnect(self):
    async def scenario():
      statuses = []
      node = server.SerialDeviceNode({
        "address": "usb:test",
        "name": "Counter-USB",
        "path": "COM9",
      }, None, statuses.append)
      node._trigger_reconnect()
      reconnect_task = node._reconnect_task
      await asyncio.sleep(0)

      await node.disconnect()

      self.assertTrue(reconnect_task.cancelled())
      self.assertIsNone(node._reconnect_task)
      self.assertFalse(node.is_reconnecting)
      self.assertTrue(node.intentional_disconnect)
      self.assertEqual(statuses[-1], "disconnected")

    asyncio.run(scenario())


if __name__ == "__main__":
  unittest.main()
