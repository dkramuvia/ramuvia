-- 기본키를 UUIDv7 으로 (2026-09-22)
--
-- 지금까지 쓰던 gen_random_uuid() 는 완전 난수(v4)라 만들어지는 순서와 값의 순서가 무관합니다.
-- 그래서 새 행이 인덱스 여기저기에 흩어져 꽂히고, 행이 많아질수록 쓰기가 느려집니다.
--
-- UUIDv7 은 앞쪽 48비트가 시각이라 만들어진 순서대로 정렬됩니다. 새 행이 인덱스 끝에만 붙어
-- 쓰기가 빨라지고, "최근 것부터" 같은 조회도 유리합니다. 겉모양과 길이는 v4 와 같습니다.
--
-- 지금 바꾸는 이유: 데이터가 쌓인 뒤에는 기본키를 바꿀 수 없습니다.
-- (PostgreSQL 18 부터 uuidv7() 이 기본 제공되므로, 그때는 이 함수를 지우고 교체하면 됩니다)

CREATE OR REPLACE FUNCTION public.uuid_generate_v7() RETURNS uuid AS $$
BEGIN
  -- v4 난수로 시작해 앞 6바이트를 현재 시각(밀리초)으로 덮고, 버전 자리를 7 로 바꿉니다
  RETURN encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION public.uuid_generate_v7() IS '시간순으로 정렬되는 UUID (RFC 9562 v7). PostgreSQL 18 이상에서는 기본 제공 uuidv7() 로 교체하세요';

GRANT EXECUTE ON FUNCTION public.uuid_generate_v7() TO app_main;
