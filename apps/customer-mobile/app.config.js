const appJson = require('./app.json');

const easProjectId =
  process.env.EAS_PROJECT_ID ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  appJson.expo?.extra?.eas?.projectId;

const isProductionBuild =
  process.env.EAS_BUILD_PROFILE === 'production' ||
  process.env.NODE_ENV === 'production';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    allowDevLogin: isProductionBuild
      ? false
      : appJson.expo.extra?.allowDevLogin === true,
    allowPhonePreview: isProductionBuild
      ? false
      : appJson.expo.extra?.allowPhonePreview === true,
  },
};
