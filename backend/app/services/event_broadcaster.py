import asyncio
import json
from typing import Set, Dict, Any
from datetime import datetime, timezone

class EventBroadcaster:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        """Register a new SSE client connection and return its event queue."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        """Unregister an SSE client connection on disconnect."""
        self._subscribers.discard(queue)

    def broadcast(self, event_type: str, data: Dict[str, Any]):
        """
        Broadcast a structured event payload to all active SSE subscribers.
        Safe to call from sync or async contexts.
        """
        payload = {
            "event": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        # Serialize datetime objects if present
        def json_serial(obj):
            if isinstance(obj, datetime):
                if obj.tzinfo is None:
                    obj = obj.replace(tzinfo=timezone.utc)
                return obj.isoformat()
            raise TypeError(f"Type {type(obj)} not serializable")

        try:
            formatted_json = json.dumps(payload, default=json_serial)
        except Exception as e:
            print(f"[ERROR] Failed to serialize SSE broadcast payload: {e}")
            return

        sse_message = f"event: {event_type}\ndata: {formatted_json}\n\n"

        for queue in list(self._subscribers):
            try:
                # Discard oldest message if queue is full
                if queue.full():
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                queue.put_nowait(sse_message)
            except Exception as e:
                print(f"[WARN] Error dispatching SSE to subscriber: {e}")
                self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

# Global singleton event broadcaster
broadcaster = EventBroadcaster()
