-- 앱 계정(app_main)이 관리자 테이블을 읽고 쓸 수 있게
--
-- 0001 에서 "그 시점에 있던 테이블"에만 권한을 줬고, 기본 권한(ALTER DEFAULT PRIVILEGES)은
-- 그 뒤 새로 만든 테이블에만 적용됩니다. 시퀀스는 기본 권한 대상이 아니라 따로 줘야 합니다.

GRANT SELECT, INSERT, UPDATE, DELETE ON config.admin_users, config.policy_audit TO app_main;
GRANT USAGE ON SEQUENCE config.policy_audit_id_seq TO app_main;
