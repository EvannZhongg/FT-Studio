import os
import csv
import json
from datetime import datetime
import shutil
import tempfile
import threading
import uuid
from dataclasses import dataclass
from typing import Optional
from utils.runtime import get_data_root

BASE_DIR = os.path.join(get_data_root(), "match_data")

CSV_HEADERS = [
  "SystemTime", "BLE_Timestamp", "DeviceRole",
  "CurrentTotal", "EventType", "TotalPlus", "TotalMinus", "MajorPenalty",
  "EventId", "MediaProvider", "MediaId", "MediaTimeMs", "MediaSyncStatus"
]


@dataclass(frozen=True)
class ScoreEventSnapshot:
  group_name: str
  ref_index: int
  contestant_name: str
  system_time: str
  ble_timestamp: int
  device_role: str
  current_total: int
  event_type: int
  total_plus: int
  total_minus: int
  major_penalty: int
  event_id: str = ""
  media_provider: str = ""
  media_id: str = ""
  media_time_ms: Optional[int] = None
  media_sync_status: str = "not_ready"


class StorageManager:
  def __init__(self):
    # 打印路径方便调试
    print(f"[Storage] Data Path: {BASE_DIR}")

    if not os.path.exists(BASE_DIR):
      os.makedirs(BASE_DIR)
    self.current_project_path = None
    self._write_lock = threading.RLock()

  def create_project(self, project_name, mode):
    """创建项目文件夹"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join([c for c in project_name if c.isalnum() or c in (' ', '_', '-')]).strip()
    folder_name = f"{timestamp}_{safe_name}"

    self.current_project_path = os.path.join(BASE_DIR, folder_name)
    os.makedirs(self.current_project_path, exist_ok=True)

    config = {
      "project_name": project_name,
      "mode": mode,
      "created_at": timestamp,
      "groups": [],
      "media": {}
    }
    self.save_config(config)
    return config

  def save_config(self, config_data):
    if not self.current_project_path: return
    path = os.path.join(self.current_project_path, "config.json")
    with self._write_lock:
      fd, temp_path = tempfile.mkstemp(prefix="config_", suffix=".tmp", dir=self.current_project_path)
      try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
          json.dump(config_data, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, path)
      finally:
        if os.path.exists(temp_path):
          os.remove(temp_path)

  def _get_group_dir(self, group_name):
    """获取(并创建)组别子文件夹"""
    if not self.current_project_path: return None
    safe_group = "".join([c for c in group_name if c.isalnum() or c in (' ', '_', '-')]).strip()
    if not safe_group: safe_group = "Default_Group"

    group_path = os.path.join(self.current_project_path, safe_group)
    if not os.path.exists(group_path):
      os.makedirs(group_path)
    return group_path

  def _get_contestant_filepath(self, group_name, contestant_name, ref_index):
    """生成文件路径: Group/选手名_RefX.csv"""
    group_dir = self._get_group_dir(group_name)
    if not group_dir: return None

    # 清洗选手名
    safe_c_name = "".join([c for c in contestant_name if c.isalnum() or c in (' ', '_', '-')]).strip()
    if not safe_c_name: safe_c_name = "Unknown_Player"

    # 文件名格式：PlayerName_Ref1.csv
    filename = f"{safe_c_name}_Ref{ref_index}.csv"
    return os.path.join(group_dir, filename)

  def log_data(self, group_name, ref_index, contestant_name, score_data, event_details):
    """
    记录数据到单独的 CSV
    """
    snapshot = ScoreEventSnapshot(
      group_name=group_name,
      ref_index=ref_index,
      contestant_name=contestant_name,
      system_time=event_details.get('system_time') or datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
      ble_timestamp=event_details.get('timestamp', 0),
      device_role=event_details.get('role', 'UNKNOWN'),
      current_total=score_data.get('total', 0),
      event_type=event_details.get('type', 0),
      total_plus=score_data.get('plus', 0),
      total_minus=score_data.get('minus', 0),
      major_penalty=score_data.get('penalty', 0),
      event_id=event_details.get('event_id') or str(uuid.uuid4()),
      media_provider=event_details.get('media_provider', ''),
      media_id=event_details.get('media_id', ''),
      media_time_ms=event_details.get('media_time_ms'),
      media_sync_status=event_details.get('media_sync_status', 'not_ready'),
    )
    self.log_event(snapshot)

  def _upgrade_csv_header(self, filepath):
    with open(filepath, 'r', newline='', encoding='utf-8-sig') as source:
      reader = csv.DictReader(source)
      current_headers = reader.fieldnames or []
      if current_headers == CSV_HEADERS:
        return
      rows = list(reader)

    fd, temp_path = tempfile.mkstemp(prefix="score_", suffix=".tmp", dir=os.path.dirname(filepath))
    try:
      with os.fdopen(fd, 'w', newline='', encoding='utf-8-sig') as target:
        writer = csv.DictWriter(target, fieldnames=CSV_HEADERS)
        writer.writeheader()
        for row in rows:
          writer.writerow({header: row.get(header, '') for header in CSV_HEADERS})
      os.replace(temp_path, filepath)
    finally:
      if os.path.exists(temp_path):
        os.remove(temp_path)

  def log_event(self, snapshot: ScoreEventSnapshot):
    if not self.current_project_path:
      return
    filepath = self._get_contestant_filepath(
      snapshot.group_name, snapshot.contestant_name, snapshot.ref_index
    )
    if not filepath:
      return

    row = {
      "SystemTime": snapshot.system_time,
      "BLE_Timestamp": snapshot.ble_timestamp,
      "DeviceRole": snapshot.device_role,
      "CurrentTotal": snapshot.current_total,
      "EventType": snapshot.event_type,
      "TotalPlus": snapshot.total_plus,
      "TotalMinus": snapshot.total_minus,
      "MajorPenalty": snapshot.major_penalty,
      "EventId": snapshot.event_id or str(uuid.uuid4()),
      "MediaProvider": snapshot.media_provider,
      "MediaId": snapshot.media_id,
      "MediaTimeMs": '' if snapshot.media_time_ms is None else snapshot.media_time_ms,
      "MediaSyncStatus": snapshot.media_sync_status,
    }
    try:
      with self._write_lock:
        if os.path.exists(filepath):
          self._upgrade_csv_header(filepath)
        else:
          with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
            csv.DictWriter(f, fieldnames=CSV_HEADERS).writeheader()
        with open(filepath, 'a', newline='', encoding='utf-8-sig') as f:
          writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
          writer.writerow(row)
    except Exception as e:
      print(f"[Storage Log Error] {e}")

  def list_projects(self):
    """列出所有历史项目"""
    projects = []
    if not os.path.exists(BASE_DIR): return []
    dirs = sorted(os.listdir(BASE_DIR), key=lambda x: os.path.getmtime(os.path.join(BASE_DIR, x)), reverse=True)
    for d in dirs:
      path = os.path.join(BASE_DIR, d)
      config_path = os.path.join(path, "config.json")
      if os.path.isdir(path) and os.path.exists(config_path):
        try:
          with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
            cfg['dir_name'] = d
            projects.append(cfg)
        except:
          pass
    return projects

  def _get_project_path(self, dir_name):
    if not dir_name or os.path.basename(dir_name) != dir_name:
      return None
    path = os.path.join(BASE_DIR, dir_name)
    if not os.path.isdir(path):
      return None
    return path

  def read_project_config(self, dir_name):
    path = self._get_project_path(dir_name)
    if not path:
      return None
    config_path = os.path.join(path, "config.json")
    if not os.path.exists(config_path):
      return None
    with open(config_path, 'r', encoding='utf-8') as f:
      config = json.load(f)
    config.setdefault("media", {})
    return config

  def load_project_config(self, dir_name):
    path = self._get_project_path(dir_name)
    config = self.read_project_config(dir_name)
    if config and path:
      self.current_project_path = path
    return config

  def save_media_binding(self, config, group_name, contestant_name, binding):
    media = config.setdefault("media", {})
    media.setdefault(group_name, {})[contestant_name] = dict(binding)
    self.save_config(config)
    return media[group_name][contestant_name]

  @staticmethod
  def get_media_binding(config, group_name, contestant_name):
    return ((config or {}).get("media") or {}).get(group_name, {}).get(contestant_name)

  def load_report_data(self, dir_name):
    """解析 CSV 生成报表数据"""
    project_path = os.path.join(BASE_DIR, dir_name)
    if not os.path.exists(project_path): return {}

    report = {}

    for group_name in os.listdir(project_path):
      group_path = os.path.join(project_path, group_name)
      if not os.path.isdir(group_path): continue

      report[group_name] = {}

      for file in os.listdir(group_path):
        if not file.endswith(".csv"): continue

        if "_Ref" not in file: continue

        try:
          base_name = file.replace(".csv", "")
          player_part, ref_part = base_name.rsplit("_Ref", 1)
          ref_idx = int(ref_part)
          c_name = player_part
        except:
          continue

        if not c_name: continue

        last_row = None
        try:
          with open(os.path.join(group_path, file), 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
              last_row = row
        except Exception as e:
          print(f"Error reading {file}: {e}")
          continue

        if last_row:
          if c_name not in report[group_name]:
            report[group_name][c_name] = {}

          # 【修改】读取 MajorPenalty
          p_val = last_row.get("MajorPenalty") or last_row.get("penalty") or 0

          report[group_name][c_name][ref_idx] = {
            "total": int(last_row.get("CurrentTotal") or 0),
            "plus": int(last_row.get("TotalPlus") or 0),
            "minus": int(last_row.get("TotalMinus") or 0),
            "penalty": int(p_val)  # 【新增】存入内存
          }

    return report

  def load_replay_data(self, dir_name, group_name, contestant_name):
    project_path = self._get_project_path(dir_name)
    config = self.read_project_config(dir_name)
    if not project_path or not config:
      return None

    safe_group = "".join([c for c in group_name if c.isalnum() or c in (' ', '_', '-')]).strip()
    safe_contestant = "".join([c for c in contestant_name if c.isalnum() or c in (' ', '_', '-')]).strip()
    group_path = os.path.join(project_path, safe_group or "Default_Group")
    if not os.path.isdir(group_path):
      return {"config": config, "binding": self.get_media_binding(config, group_name, contestant_name), "events": []}

    referee_names = {}
    for group in config.get("groups", []):
      if group.get("name") == group_name:
        referee_names = {
          int(referee.get("index")): referee.get("name") or f"Referee {referee.get('index')}"
          for referee in group.get("referees", []) if referee.get("index") is not None
        }
        break

    events = []
    prefix = f"{safe_contestant or 'Unknown_Player'}_Ref"
    for filename in os.listdir(group_path):
      if not filename.startswith(prefix) or not filename.endswith(".csv"):
        continue
      try:
        ref_index = int(filename[:-4].rsplit("_Ref", 1)[1])
      except (ValueError, IndexError):
        continue

      previous = {"plus": 0, "minus": 0, "penalty": 0}
      with open(os.path.join(group_path, filename), 'r', encoding='utf-8-sig') as f:
        for row_index, row in enumerate(csv.DictReader(f)):
          try:
            plus = int(row.get("TotalPlus") or 0)
            minus = int(row.get("TotalMinus") or 0)
            penalty = int(row.get("MajorPenalty") or row.get("penalty") or 0)
            total = int(row.get("CurrentTotal") or 0)
            media_time_raw = row.get("MediaTimeMs")
            media_time_ms = int(media_time_raw) if media_time_raw not in (None, "") else None
          except (TypeError, ValueError):
            continue

          events.append({
            "event_id": row.get("EventId") or f"ref{ref_index}-row{row_index}",
            "system_time": row.get("SystemTime") or "",
            "ble_timestamp": int(row.get("BLE_Timestamp") or 0),
            "referee_index": ref_index,
            "referee_name": referee_names.get(ref_index, f"Referee {ref_index}"),
            "device_role": row.get("DeviceRole") or "UNKNOWN",
            "event_type": int(row.get("EventType") or 0),
            "delta_plus": plus - previous["plus"],
            "delta_minus": minus - previous["minus"],
            "delta_penalty": penalty - previous["penalty"],
            "total_plus": plus,
            "total_minus": minus,
            "major_penalty": penalty,
            "current_total": total,
            "media_provider": row.get("MediaProvider") or "",
            "media_id": row.get("MediaId") or "",
            "media_time_ms": media_time_ms,
            "media_sync_status": row.get("MediaSyncStatus") or ("aligned" if media_time_ms is not None else "not_ready"),
          })
          previous = {"plus": plus, "minus": minus, "penalty": penalty}

    events.sort(key=lambda event: (event["system_time"], event["referee_index"], event["event_id"]))
    return {
      "config": config,
      "binding": self.get_media_binding(config, group_name, contestant_name),
      "events": events,
    }

  def get_scored_players(self, group_name):
    """获取已打分选手"""
    if not self.current_project_path: return []
    group_dir = self._get_group_dir(group_name)
    if not os.path.exists(group_dir): return []

    scored_contestants = set()
    try:
      for file in os.listdir(group_dir):
        if file.endswith(".csv") and "_Ref" in file:
          base_name = file.replace(".csv", "")
          try:
            c_name, _ = base_name.rsplit("_Ref", 1)
            if c_name: scored_contestants.add(c_name)
          except:
            pass
    except Exception as e:
      print(f"Error scanning scored players: {e}")

    return list(scored_contestants)

  def delete_project(self, dir_name):
    if not dir_name: return False
    project_path = self._get_project_path(dir_name)
    if project_path and os.path.exists(project_path):
      try:
        shutil.rmtree(project_path)
        return True
      except:
        return False
    return False


# 单例模式
storage_manager = StorageManager()
