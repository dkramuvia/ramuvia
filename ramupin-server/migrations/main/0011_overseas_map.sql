-- 해외 지도(Mapbox) 사용 권한 (09-18 대표 결정)
--
--   국내는 네이버(로드뷰·장소명이 정확), 해외는 Mapbox, 그 외는 구글.
--   Mapbox 는 지도를 띄울 때마다 과금되므로 유료 등급만 씁니다.

UPDATE config.plan_policies
SET policy = jsonb_set(policy, '{features,overseasMap}', to_jsonb(policy->'features'->'premiumMap' = 'true'::jsonb)),
    updated_at = now()
WHERE NOT (policy->'features' ? 'overseasMap');
