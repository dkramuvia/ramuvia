-- 신체 활동 인식 (WBS 2.3, 8.6): 걷기·자전거·차량·정지
--
-- 위치만으로는 실내에서 쓰러져 있는 것과 가만히 앉아 있는 것을 구분할 수 없습니다.
-- 좌표는 둘 다 그대로이기 때문입니다. 이 값이 있어야 "전혀 안 움직인다"를 판정할 수 있습니다.

ALTER TABLE location.location_points
  ADD COLUMN IF NOT EXISTS activity text;

COMMENT ON COLUMN location.location_points.activity IS 'still / walking / running / bicycle / vehicle / tilting (안드로이드 활동 인식)';
