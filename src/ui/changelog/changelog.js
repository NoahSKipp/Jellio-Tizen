// What's New changelog data for Jellio Tizen.
import { readString, writeString } from '../../runtime/storage.js';

const KEY_LAST_SEEN_CHANGELOG = 'jellio_last_seen_changelog';

export function isBigRelease(version) {
  if (!version || typeof version !== 'string') return false;
  const parts = version.replace(/^v/, '').split('.');
  return parts.length >= 3 && parts[2] === '0';
}

export const CHANGELOG_RELEASES = [
  {
    version: '0.84.0',
    title: 'What\'s New in Jellio TV',
    subtitle: 'Version 0.84.0',
    summary: 'Native Samsung Tizen TV client with spatial navigation, Quick Hub, and HDR playback.',
    features: [
      {
        title: 'Native Tizen TV Support',
        description: 'Complete 10-foot TV experience tailored for Samsung Smart TVs running Tizen OS.',
      },
      {
        title: 'Unified Quick Hub Drawer',
        description: 'Access Now Playing, Notifications, and quick controls in a dark glassy drawer.',
      },
      {
        title: 'Media Tech Badges',
        description: 'Automatic detection and display for 4K UHD, HDR10, Dolby Vision, and Dolby Atmos audio.',
      },
      {
        title: 'Fast Spatial Navigation',
        description: 'Deterministic 2D directional navigation engine for smooth D-pad remote browsing.',
      },
    ],
  },
  {
    version: '0.83.0',
    title: 'What\'s New in Jellio TV',
    subtitle: 'Version 0.83.0',
    summary: 'Live updating now playing bar, account-safe stream handoff, and notification timestamps.',
    features: [
      {
        title: 'Live Updating Now Playing Bar',
        description: 'Playback progress, timestamps, and completion percentage advance live second by second.',
      },
      {
        title: 'Account-Safe Stream Handoff',
        description: 'Stream handoff is restricted exclusively to your own user account, keeping streams safe.',
      },
      {
        title: 'Glassy Now Playing Pill',
        description: 'The floating Now Playing indicator is restyled in Jellio\'s dark aesthetic with display toggles.',
      },
      {
        title: 'Notification Timestamps',
        description: 'View relative reception timestamps on alerts with one-click individual dismissal.',
      },
    ],
  },
  {
    version: '0.80.0',
    title: 'What\'s New in Jellio TV',
    subtitle: 'Version 0.80.0',
    summary: 'Unified Quick Hub drawer, remote button recorder, and navigation rail improvements.',
    features: [
      {
        title: 'Unified Quick Hub Drawer',
        description: 'Access Now Playing, Notifications, and quick controls in a newly designed glassy dark drawer.',
      },
      {
        title: 'Remote Button Recorder & Custom Mapping',
        description: 'Map remote buttons to the Quick Hub using the interactive button recorder.',
      },
      {
        title: 'Streamlined Navigation Rail',
        description: 'The main navigation rail is simplified, keeping drawer controls within easy reach.',
      },
      {
        title: 'Dedicated Remote Settings',
        description: 'Fine-tune hold durations, button triggers, and device-specific defaults.',
      },
    ],
  },
  {
    version: '0.71.0',
    title: 'What\'s New in Jellio TV',
    subtitle: 'Version 0.71.0',
    summary: 'Multi-edition recognition, dynamic island now playing pill, and voice dictation.',
    features: [
      {
        title: 'Multi-Edition & Version Recognition',
        description: 'Automatic recognition and interactive toggle between Color vs Noir, Theatrical, and Director\'s cuts.',
      },
      {
        title: 'Dynamic Island Now Playing Pill',
        description: 'Compact floating status indicator on the home screen showing current playback state and progress.',
      },
      {
        title: 'Voice Dictation & 16:9 Banners',
        description: 'On-screen keyboard supports voice dictation, accompanied by optimized 16:9 TV banners.',
      },
    ],
  },
  {
    version: '0.70.0',
    title: 'What\'s New in Jellio TV',
    subtitle: 'Version 0.70.0',
    summary: 'Custom genre management, profile recommendations sync, and library genre activation.',
    features: [
      {
        title: 'Custom Genre Management',
        description: 'Long-press any custom genre row to remove it with modal confirmation.',
      },
      {
        title: 'Profile Recommendations Sync',
        description: 'Custom genre rows and recommendations sync seamlessly with your Jellio profile across all devices.',
      },
      {
        title: '1-Click Library Genre Activation',
        description: 'Search detects standard library genres with a direct 1-click button to add them to your Home rows.',
      },
    ],
  },
];

export const CURRENT_CHANGELOG = CHANGELOG_RELEASES[0];
export const LATEST_BIG_CHANGELOG = CHANGELOG_RELEASES.find((r) => isBigRelease(r.version)) || CURRENT_CHANGELOG;

export function getLastSeenChangelogVersion() {
  return readString(KEY_LAST_SEEN_CHANGELOG, '');
}

export function markLatestChangelogSeen() {
  writeString(KEY_LAST_SEEN_CHANGELOG, CURRENT_CHANGELOG.version);
}

export function shouldShowChangelogNotification() {
  const lastSeen = getLastSeenChangelogVersion();
  if (!lastSeen) return false;
  if (!isBigRelease(CURRENT_CHANGELOG.version)) return false;
  return lastSeen !== CURRENT_CHANGELOG.version;
}
