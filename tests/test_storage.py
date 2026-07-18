import csv
import json
import os
import tempfile
import unittest
from dataclasses import FrozenInstanceError
from unittest.mock import patch

from utils.storage import CSV_HEADERS, ScoreEventSnapshot, StorageManager


def make_snapshot(**overrides):
  values = {
    "group_name": "Open",
    "ref_index": 1,
    "contestant_name": "Alice",
    "system_time": "2026-07-18 10:00:00.100",
    "ble_timestamp": 123,
    "device_role": "PRIMARY",
    "current_total": 1,
    "event_type": 1,
    "total_plus": 1,
    "total_minus": 0,
    "major_penalty": 0,
    "event_id": "event-1",
    "media_provider": "youtube",
    "media_id": "dQw4w9WgXcQ",
    "media_time_ms": 4567,
    "media_sync_status": "aligned",
  }
  values.update(overrides)
  return ScoreEventSnapshot(**values)


class StorageTests(unittest.TestCase):
  def setUp(self):
    self.tempdir = tempfile.TemporaryDirectory()
    self.base_patch = patch("utils.storage.BASE_DIR", self.tempdir.name)
    self.base_patch.start()
    self.storage = StorageManager()
    self.config = self.storage.create_project("Demo", "TOURNAMENT")
    self.config["groups"] = [{
      "name": "Open",
      "players": ["Alice"],
      "referees": [{"index": 1, "name": "Judge A"}],
    }]
    self.config["media"] = {"Open": {"Alice": {
      "provider": "youtube",
      "video_id": "dQw4w9WgXcQ",
      "canonical_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    }}}
    self.storage.save_config(self.config)

  def tearDown(self):
    self.base_patch.stop()
    self.tempdir.cleanup()

  def read_rows(self, path):
    with open(path, "r", encoding="utf-8-sig", newline="") as source:
      reader = csv.DictReader(source)
      return reader.fieldnames, list(reader)

  def test_new_csv_contains_media_columns(self):
    self.storage.log_event(make_snapshot())
    path = self.storage._get_contestant_filepath("Open", "Alice", 1)
    headers, rows = self.read_rows(path)
    self.assertEqual(headers, CSV_HEADERS)
    self.assertEqual(rows[0]["EventId"], "event-1")
    self.assertEqual(rows[0]["MediaTimeMs"], "4567")
    self.assertEqual(rows[0]["MediaSyncStatus"], "aligned")

  def test_old_csv_header_is_upgraded_without_changing_history(self):
    path = self.storage._get_contestant_filepath("Open", "Alice", 1)
    old_headers = CSV_HEADERS[:8]
    with open(path, "w", encoding="utf-8-sig", newline="") as target:
      writer = csv.DictWriter(target, fieldnames=old_headers)
      writer.writeheader()
      writer.writerow({
        "SystemTime": "2026-07-18 09:59:59.000",
        "BLE_Timestamp": 1,
        "DeviceRole": "PRIMARY",
        "CurrentTotal": 0,
        "EventType": 0,
        "TotalPlus": 0,
        "TotalMinus": 0,
        "MajorPenalty": 0,
      })

    self.storage.log_event(make_snapshot())
    headers, rows = self.read_rows(path)
    self.assertEqual(headers, CSV_HEADERS)
    self.assertEqual(len(rows), 2)
    self.assertEqual(rows[0]["EventId"], "")
    self.assertEqual(rows[0]["MediaTimeMs"], "")
    self.assertEqual(rows[1]["EventId"], "event-1")

  def test_replay_is_read_only_and_calculates_per_referee_deltas(self):
    active_path = self.storage.current_project_path
    self.storage.log_event(make_snapshot())
    self.storage.log_event(make_snapshot(
      event_id="event-2",
      system_time="2026-07-18 10:00:00.200",
      current_total=0,
      total_minus=1,
      media_time_ms=None,
      media_sync_status="stale",
    ))
    dir_name = os.path.basename(active_path)
    replay = self.storage.load_replay_data(dir_name, "Open", "Alice")
    self.assertEqual(self.storage.current_project_path, active_path)
    self.assertEqual(replay["binding"]["video_id"], "dQw4w9WgXcQ")
    self.assertEqual(replay["events"][0]["delta_plus"], 1)
    self.assertEqual(replay["events"][1]["delta_minus"], 1)
    self.assertIsNone(replay["events"][1]["media_time_ms"])
    self.assertEqual(replay["events"][0]["referee_name"], "Judge A")

  def test_snapshot_is_immutable(self):
    snapshot = make_snapshot()
    with self.assertRaises(FrozenInstanceError):
      snapshot.current_total = 99

  def test_config_media_is_backward_compatible(self):
    path = os.path.join(self.storage.current_project_path, "config.json")
    with open(path, "r", encoding="utf-8") as source:
      config = json.load(source)
    config.pop("media")
    with open(path, "w", encoding="utf-8") as target:
      json.dump(config, target)
    loaded = self.storage.read_project_config(os.path.basename(self.storage.current_project_path))
    self.assertEqual(loaded["media"], {})


if __name__ == "__main__":
  unittest.main()
