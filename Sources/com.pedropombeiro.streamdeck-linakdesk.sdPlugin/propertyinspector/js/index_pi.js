/* global addDynamicStyles, $SD */

const DEFAULT_SETTINGS = {
  homeAssistantUrl: '',
  accessToken: '',
  deskPositionEntityId: 'input_select.desk_position',
  deskCoverEntityId: 'cover.office_desk',
  deskStandingEntityId: 'binary_sensor.office_desk_standing',
  deskConnectionEntityId: 'binary_sensor.office_desk_connection',
  deskHeightEntityId: 'input_number.office_desk_last_height',
};

const FIELD_IDS = Object.keys(DEFAULT_SETTINGS);

let settings = { ...DEFAULT_SETTINGS };
let saveTimeout = 0;

function normalizeSettings(nextSettings) {
  const normalized = { ...DEFAULT_SETTINGS };
  FIELD_IDS.forEach((field) => {
    const value = nextSettings && nextSettings[field];
    normalized[field] = typeof value === 'string' ? value : DEFAULT_SETTINGS[field];
  });
  return normalized;
}

function updateUI() {
  FIELD_IDS.forEach((field) => {
    const element = document.getElementById(field);
    if (element) {
      element.value = settings[field] || '';
    }
  });
}

function persistSettings() {
  if ($SD && $SD.api && $SD.uuid) {
    $SD.api.setSettings($SD.uuid, settings);
  }
}

function queuePersist() {
  if (saveTimeout) {
    window.clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(() => {
    persistSettings();
    saveTimeout = 0;
  }, 150);
}

function bindFields() {
  FIELD_IDS.forEach((field) => {
    const element = document.getElementById(field);
    if (!element) {
      return;
    }
    const eventName = field === 'accessToken' ? 'change' : 'input';
    element.addEventListener(eventName, () => {
      settings[field] = element.value.trim();
      queuePersist();
    });
  });
}

$SD.on('connected', (jsn) => {
  addDynamicStyles($SD.applicationInfo.colors, 'connectSocket');
  settings = normalizeSettings(jsn.actionInfo && jsn.actionInfo.payload && jsn.actionInfo.payload.settings);
  updateUI();
  bindFields();
});

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add(navigator.userAgent.includes('Mac') ? 'mac' : 'win');
});
