const tableStub = new Proxy(
  {},
  {
    get() {
      return tableStub;
    },
  },
);

export const users = tableStub;
export const emailVerificationChallenges = tableStub;
export const emailVerificationRateLimits = tableStub;
export const accountSubscriptions = tableStub;
export const oauthLinks = tableStub;
export const playlists = tableStub;
export const playlistItems = tableStub;
export const playlistInvites = tableStub;
export const playlistMembers = tableStub;
export const remoteDevices = tableStub;
export const remoteCommands = tableStub;
export const remotePairingCodes = tableStub;
export const remoteDeviceAuthorizations = tableStub;
export const remoteMediaDevices = tableStub;
export const likes = tableStub;
export const history = tableStub;
export const profiles = tableStub;
export const feedbackSubmissions = tableStub;
export const profileLikes = tableStub;
export const systemSettings = tableStub;
export const listenTogetherSessions = tableStub;
export const listenTogetherInvites = tableStub;
export const tasteState = tableStub;
