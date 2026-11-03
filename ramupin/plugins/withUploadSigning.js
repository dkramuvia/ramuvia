// 플레이 스토어 업로드 키로 release 빌드에 서명합니다.
// 키 정보 파일 위치는 PC의 ~/.gradle/gradle.properties 의 ramupinUploadKey 에 적습니다 (키는 저장소에 두지 않습니다).
// 파일이 없는 PC에서는 예전처럼 개발용(debug) 키로 서명합니다
const { withAppBuildGradle } = require('expo/config-plugins');

const LOAD = `
def uploadKeyProps = new Properties()
def uploadKeyPath = findProperty('ramupinUploadKey')
if (uploadKeyPath && file(uploadKeyPath).exists()) file(uploadKeyPath).withInputStream { uploadKeyProps.load(it) }
`;

const RELEASE_CONFIG = `
        if (uploadKeyProps['RAMUPIN_UPLOAD_STORE_FILE']) {
            release {
                storeFile file(uploadKeyProps['RAMUPIN_UPLOAD_STORE_FILE'])
                storePassword uploadKeyProps['RAMUPIN_UPLOAD_STORE_PASSWORD']
                keyAlias uploadKeyProps['RAMUPIN_UPLOAD_KEY_ALIAS']
                keyPassword uploadKeyProps['RAMUPIN_UPLOAD_KEY_PASSWORD']
            }
        }`;

module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes('uploadKeyProps')) return cfg;
    src = src.replace(/\nandroid \{/, `${LOAD}\nandroid {`);
    src = src.replace(/signingConfigs \{/, `signingConfigs {${RELEASE_CONFIG}`);
    src = src.replace(
      /(release \{[^}]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig uploadKeyProps[\'RAMUPIN_UPLOAD_STORE_FILE\'] ? signingConfigs.release : signingConfigs.debug',
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
