import unittest
from unittest.mock import patch

import server


class ScoreSnapshotTests(unittest.TestCase):
  def test_rapid_events_keep_score_and_context_from_arrival(self):
    referee = server.HeadlessReferee(1, "Judge A", "SINGLE", None)
    referee._broadcast_update = lambda message_type: None
    original_state = dict(server.match_state)
    server.match_state.update({
      "current_group": "Open",
      "current_contestant": "Alice",
      "config": {"mode": "TOURNAMENT", "media": {}},
    })
    snapshots = []

    try:
      with patch.object(server.storage_manager, "log_event", side_effect=snapshots.append):
        referee._on_pri_data(1, 1, 1, 0, 100)
        server.match_state["current_contestant"] = "Bob"
        referee._on_pri_data(2, 1, 2, 0, 200)
    finally:
      server.match_state.clear()
      server.match_state.update(original_state)

    self.assertEqual([snapshot.contestant_name for snapshot in snapshots], ["Alice", "Bob"])
    self.assertEqual([snapshot.current_total for snapshot in snapshots], [1, 2])
    self.assertEqual([snapshot.total_plus for snapshot in snapshots], [1, 2])
    self.assertNotEqual(snapshots[0].event_id, snapshots[1].event_id)


if __name__ == "__main__":
  unittest.main()
