/* global $SD */

const ACTION_UUID = 'com.pedropombeiro.streamdeck-linakdesk.toggle';
const DEFAULT_SETTINGS = {
  homeAssistantUrl: '',
  accessToken: '',
  deskPositionEntityId: 'input_select.desk_position',
  deskCoverEntityId: 'cover.office_desk',
  deskConnectButtonEntityId: 'button.office_desk_connect',
  deskStandingEntityId: 'binary_sensor.office_desk_standing',
  deskConnectionEntityId: 'binary_sensor.office_desk_connection',
  deskHeightEntityId: 'input_number.office_desk_last_height',
  lastKnownPosition: 'sitting',
  lastKnownHeight: '',
};
const RECONNECT_DELAY_MS = 3000;
const LONG_PRESS_DELAY_MS = 600;
const CONNECTING_TIMEOUT_MS = 10000;
const SHOW_OK_DELAY_MS = 1500;

function normalizeSettings(settings) {
  const normalized = Object.assign({}, DEFAULT_SETTINGS);
  Object.keys(DEFAULT_SETTINGS).forEach((key) => {
    const value = settings && settings[key];
    if (typeof value === 'string') {
      normalized[key] = value;
    }
  });
  normalized.lastKnownPosition = normalized.lastKnownPosition === 'standing' ? 'standing' : 'sitting';
  return normalized;
}

function sanitizeBaseUrl(url) {
  if (!url) {
    return '';
  }
  return String(url).trim().replace(/\/+$/, '');
}

function buildWebSocketUrl(baseUrl) {
  const sanitized = sanitizeBaseUrl(baseUrl);
  if (!sanitized) {
    return '';
  }
  if (/^wss?:\/\//i.test(sanitized)) {
    return sanitized;
  }
  if (/^https?:\/\//i.test(sanitized)) {
    return `${sanitized.replace(/^http/i, 'ws')}/api/websocket`;
  }
  return `ws://${sanitized}/api/websocket`;
}

function parseHeight(value, attributes) {
  if (value === undefined || value === null || value === '' || value === 'unknown' || value === 'unavailable') {
    return '';
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const unit = attributes && typeof attributes.unit_of_measurement === 'string'
      ? attributes.unit_of_measurement.trim().toLowerCase()
      : '';
    const deviceClass = attributes && typeof attributes.device_class === 'string'
      ? attributes.device_class.trim().toLowerCase()
      : '';
    const likelyMeters = unit === 'm' || deviceClass === 'distance' || (numeric > 0 && numeric < 3);
    if (likelyMeters) {
      const roundedMeters = Math.round(numeric * 100) / 100;
      return `${roundedMeters.toFixed(2)} m`;
    }
    const displayUnit = unit || 'cm';
    const rounded = Math.round(numeric * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded} ${displayUnit}` : `${rounded.toFixed(1)} ${displayUnit}`;
  }
  return String(value);
}

const homeAssistant = {
  socket: null,
  connectionKey: '',
  authToken: '',
  reconnectTimer: 0,
  nextMessageId: 1,
  listeners: {},
  entityStates: {},
  pendingCallbacks: {},
  isConnected: false,
  manualDisconnect: false,

  addWatcher(controller) {
    this.listeners[controller.context] = controller;
    controller.handleConnectionChange(this.isConnected);
    controller.handleStatesChanged(this.entityStates);
    this.ensureConnection();
  },

  removeWatcher(context) {
    delete this.listeners[context];
    if (!this.hasWatchers()) {
      this.disconnect();
    }
  },

  hasWatchers() {
    return Object.keys(this.listeners).length > 0;
  },

  getActiveConfig() {
    const contexts = Object.keys(this.listeners);
    for (let i = 0; i < contexts.length; i += 1) {
      const controller = this.listeners[contexts[i]];
      if (controller && controller.hasCredentials()) {
        return controller.settings;
      }
    }
    return null;
  },

  ensureConnection() {
    const config = this.getActiveConfig();
    if (!config) {
      this.disconnect();
      this.notifyConnectionChanged(false);
      return;
    }

    const connectionKey = `${sanitizeBaseUrl(config.homeAssistantUrl)}|${config.accessToken}`;
    if (this.socket && this.connectionKey === connectionKey) {
      return;
    }

    this.disconnect(false);
    this.connectionKey = connectionKey;
    this.authToken = config.accessToken;
    this.manualDisconnect = false;

    const websocketUrl = buildWebSocketUrl(config.homeAssistantUrl);
    if (!websocketUrl) {
      this.notifyConnectionChanged(false);
      return;
    }

    this.socket = new WebSocket(websocketUrl);
    this.socket.onopen = () => this.handleOpen();
    this.socket.onmessage = (event) => this.handleMessage(event);
    this.socket.onerror = () => this.handleClose();
    this.socket.onclose = () => this.handleClose();
  },

  disconnect(clearConnection = true) {
    this.manualDisconnect = true;
    this.isConnected = false;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = 0;
    }
    this.pendingCallbacks = {};
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        this.socket.close();
      } catch (error) {}
      this.socket = null;
    }
    if (clearConnection) {
      this.connectionKey = '';
      this.authToken = '';
      this.entityStates = {};
    }
  },

  handleOpen() {
    this.send({ type: 'auth', access_token: this.authToken });
  },

  handleClose() {
    if (!this.socket && !this.isConnected) {
      return;
    }
    this.socket = null;
    this.isConnected = false;
    this.notifyConnectionChanged(false);
    this.scheduleReconnect();
  },

  scheduleReconnect() {
    if (this.manualDisconnect || this.reconnectTimer || !this.hasWatchers()) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0;
      this.ensureConnection();
    }, RECONNECT_DELAY_MS);
  },

  handleMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (message.type === 'auth_required') {
      this.send({ type: 'auth', access_token: this.authToken });
      return;
    }

    if (message.type === 'auth_ok') {
      this.isConnected = true;
      this.notifyConnectionChanged(true);
      this.send({ id: this.nextId(), type: 'subscribe_events', event_type: 'state_changed' }, (response) => {
        if (response && response.success) {
          this.requestInitialStates();
        }
      });
      return;
    }

    if (message.type === 'auth_invalid') {
      this.handleClose();
      return;
    }

    if (message.type === 'event' && message.event && message.event.data && message.event.data.new_state) {
      const state = message.event.data.new_state;
      if (state.entity_id) {
        this.entityStates[state.entity_id] = state;
        this.notifyStatesChanged();
      }
      return;
    }

    if (message.type === 'result' && message.id && this.pendingCallbacks[message.id]) {
      const callback = this.pendingCallbacks[message.id];
      delete this.pendingCallbacks[message.id];
      callback(message);
    }
  },

  send(payload, callback) {
    if (!this.socket || this.socket.readyState !== 1) {
      if (payload && payload.id && callback) {
        callback({ success: false });
      }
      return;
    }
    if (payload.id && callback) {
      this.pendingCallbacks[payload.id] = callback;
    }
    this.socket.send(JSON.stringify(payload));
  },

  nextId() {
    const nextId = this.nextMessageId;
    this.nextMessageId += 1;
    return nextId;
  },

  requestInitialStates() {
    this.send({ id: this.nextId(), type: 'get_states' }, (response) => {
      if (!response || !response.success || !Array.isArray(response.result)) {
        return;
      }
      this.entityStates = {};
      response.result.forEach((state) => {
        if (state && state.entity_id) {
          this.entityStates[state.entity_id] = state;
        }
      });
      this.notifyStatesChanged();
    });
  },

  callService(domain, service, serviceData, callback) {
    this.send(
      {
        id: this.nextId(),
        type: 'call_service',
        domain: domain,
        service: service,
        service_data: serviceData || {},
      },
      callback,
    );
  },

  notifyConnectionChanged(isConnected) {
    Object.keys(this.listeners).forEach((context) => {
      this.listeners[context].handleConnectionChange(isConnected);
    });
  },

  notifyStatesChanged() {
    Object.keys(this.listeners).forEach((context) => {
      this.listeners[context].handleStatesChanged(this.entityStates);
    });
  },
};

function DeskController(jsonObj) {
  this.context = jsonObj.context;
  this.settings = normalizeSettings(jsonObj.payload.settings);
  this.connectionOnline = false;
  this.entityStates = {};
  this.lastRenderKey = '';
  this.persistTimer = 0;
  this.pressTimer = 0;
  this.longPressTriggered = false;
  this.keyIsDown = false;
  this.connecting = false;
  this.connectingTimer = 0;
  this.renderSuppressedUntil = 0;
  this.pendingToggle = false;
}

DeskController.prototype.hasCredentials = function () {
  return Boolean(this.settings.homeAssistantUrl && this.settings.accessToken);
};

DeskController.prototype.updateSettings = function (nextSettings) {
  const previousConnectionKey = `${sanitizeBaseUrl(this.settings.homeAssistantUrl)}|${this.settings.accessToken}`;
  this.settings = normalizeSettings(nextSettings);
  const currentConnectionKey = `${sanitizeBaseUrl(this.settings.homeAssistantUrl)}|${this.settings.accessToken}`;
  if (previousConnectionKey !== currentConnectionKey) {
    homeAssistant.ensureConnection();
  }
  this.render();
};

DeskController.prototype.persistSettings = function () {
  if (this.persistTimer) {
    window.clearTimeout(this.persistTimer);
  }
  this.persistTimer = window.setTimeout(() => {
    this.persistTimer = 0;
    $SD.api.setSettings(this.context, this.settings);
  }, 100);
};

DeskController.prototype.handleConnectionChange = function (isConnected) {
  this.connectionOnline = isConnected;
  this.render();
};

DeskController.prototype.clearConnectingTimer = function () {
  if (this.connectingTimer) {
    window.clearTimeout(this.connectingTimer);
    this.connectingTimer = 0;
  }
};

DeskController.prototype.handleStatesChanged = function (entityStates) {
  this.entityStates = entityStates || {};
  const connectionEntity = this.getEntity(this.settings.deskConnectionEntityId);
  if (this.connecting && connectionEntity && connectionEntity.state === 'on') {
    const hadPendingToggle = this.pendingToggle;
    this.connecting = false;
    this.pendingToggle = false;
    this.clearConnectingTimer();
    this.renderSuppressedUntil = Date.now() + SHOW_OK_DELAY_MS;
    $SD.api.showOk(this.context);
    window.setTimeout(() => {
      this.renderSuppressedUntil = 0;
      this.lastRenderKey = '';
      this.render();
      if (hadPendingToggle) {
        this.selectNextPosition();
      }
    }, SHOW_OK_DELAY_MS);
    return;
  }
  this.render();
};

DeskController.prototype.getEntity = function (entityId) {
  return entityId ? this.entityStates[entityId] : null;
};

DeskController.prototype.getMotionState = function () {
  const coverEntity = this.getEntity(this.settings.deskCoverEntityId);
  if (coverEntity && coverEntity.state === 'opening') {
    return 'up';
  }
  if (coverEntity && coverEntity.state === 'closing') {
    return 'down';
  }
  return 'idle';
};

DeskController.prototype.isMoving = function () {
  return this.getMotionState() !== 'idle';
};

DeskController.prototype.clearPressTimer = function () {
  if (this.pressTimer) {
    window.clearTimeout(this.pressTimer);
    this.pressTimer = 0;
  }
};

DeskController.prototype.selectNextPosition = function () {
  homeAssistant.callService(
    'input_select',
    'select_next',
    { entity_id: this.settings.deskPositionEntityId },
    (response) => {
      if (!response || !response.success) {
        $SD.api.showAlert(this.context);
        return;
      }
      if (!this.connecting) {
        $SD.api.showOk(this.context);
      }
    },
  );
};

DeskController.prototype.computeViewModel = function () {
  const standingEntity = this.getEntity(this.settings.deskStandingEntityId);
  const connectionEntity = this.getEntity(this.settings.deskConnectionEntityId);
  const heightEntity = this.getEntity(this.settings.deskHeightEntityId);
  const coverEntity = this.getEntity(this.settings.deskCoverEntityId);

  let stablePosition = this.settings.lastKnownPosition === 'standing' ? 'standing' : 'sitting';
  if (standingEntity && standingEntity.state === 'on') {
    stablePosition = 'standing';
  } else if (standingEntity && standingEntity.state === 'off') {
    stablePosition = 'sitting';
  } else if (coverEntity && coverEntity.state === 'open') {
    stablePosition = 'standing';
  } else if (coverEntity && coverEntity.state === 'closed') {
    stablePosition = 'sitting';
  }

  let motion = this.getMotionState();

  const entityOnline = !connectionEntity || connectionEntity.state === 'on';
  const online = Boolean(this.connectionOnline && entityOnline);
  const connecting = this.connecting;
  if (!online) {
    motion = 'idle';
  }

  if (motion === 'idle' && this.settings.lastKnownPosition !== stablePosition) {
    this.settings.lastKnownPosition = stablePosition;
    this.persistSettings();
  }

  const height = heightEntity ? parseHeight(heightEntity.state, heightEntity.attributes) : this.settings.lastKnownHeight;
  if (height && this.settings.lastKnownHeight !== height) {
    this.settings.lastKnownHeight = height;
    this.persistSettings();
  }

  let title = height || '';
  if (connecting) {
    title = 'Connecting';
  }
  if (!title) {
    if (motion === 'up') {
      title = 'UP';
    } else if (motion === 'down') {
      title = 'DOWN';
    } else {
      title = stablePosition === 'standing' ? 'STAND' : 'SIT';
    }
  }

  return {
    image: (online && !connecting) ? `action/images/${stablePosition}` : `action/images/${stablePosition}-offline`,
    state: stablePosition === 'standing' ? 1 : 0,
    title: title,
  };
};

DeskController.prototype.render = function () {
  if (this.renderSuppressedUntil && Date.now() < this.renderSuppressedUntil) {
    return;
  }
  const model = this.computeViewModel();
  const renderKey = [model.image, model.state, model.title].join('|');
  if (renderKey === this.lastRenderKey) {
    return;
  }
  this.lastRenderKey = renderKey;
  $SD.api.send(this.context, 'setState', { payload: { state: model.state } });
  $SD.api.setTitle(this.context, model.title);
  $SD.api.setImage(this.context, model.image, 0);
};

DeskController.prototype.startConnecting = function () {
  if (this.connecting) {
    return;
  }
  this.connecting = true;
  this.clearConnectingTimer();
  this.connectingTimer = window.setTimeout(() => {
    this.connecting = false;
    this.connectingTimer = 0;
    this.render();
    $SD.api.showAlert(this.context);
  }, CONNECTING_TIMEOUT_MS);
  this.render();
};

DeskController.prototype.toggle = function () {
  if (!this.hasCredentials()) {
    $SD.api.showAlert(this.context);
    return;
  }

  if (this.connecting) {
    return;
  }

  const connectionEntity = this.getEntity(this.settings.deskConnectionEntityId);
  if (connectionEntity && connectionEntity.state === 'off') {
    this.pendingToggle = true;
    this.connectDeskController();
    return;
  }

  this.selectNextPosition();
};

DeskController.prototype.connectDeskController = function () {
  if (!this.hasCredentials() || !this.settings.deskConnectButtonEntityId) {
    $SD.api.showAlert(this.context);
    return;
  }

  this.startConnecting();

  homeAssistant.callService(
    'button',
    'press',
    { entity_id: this.settings.deskConnectButtonEntityId },
    (response) => {
      if (!response || !response.success) {
        this.connecting = false;
        this.clearConnectingTimer();
        this.render();
        $SD.api.showAlert(this.context);
      }
    },
  );
};

DeskController.prototype.handleKeyDown = function () {
  this.keyIsDown = true;
  this.clearPressTimer();
  this.longPressTriggered = false;
  this.pressTimer = window.setTimeout(() => {
    this.pressTimer = 0;
    if (!this.keyIsDown) {
      return;
    }
    this.longPressTriggered = true;
    this.connectDeskController();
  }, LONG_PRESS_DELAY_MS);
};

DeskController.prototype.handleKeyUp = function () {
  this.keyIsDown = false;
  this.clearPressTimer();
  if (this.longPressTriggered) {
    this.longPressTriggered = false;
    return;
  }
  this.toggle();
};

const action = {
  controllers: {},

  ensureController(jsn) {
    let controller = this.controllers[jsn.context];
    if (!controller) {
      controller = new DeskController(jsn);
      this.controllers[jsn.context] = controller;
      homeAssistant.addWatcher(controller);
    }
    return controller;
  },

  onWillAppear(jsn) {
    this.ensureController(jsn).updateSettings(jsn.payload.settings);
  },

  onWillDisappear(jsn) {
    delete this.controllers[jsn.context];
    homeAssistant.removeWatcher(jsn.context);
  },

  onDidReceiveSettings(jsn) {
    this.ensureController(jsn).updateSettings(jsn.payload.settings);
  },

  onKeyDown(jsn) {
    this.ensureController(jsn).handleKeyDown();
  },

  onKeyUp(jsn) {
    this.ensureController(jsn).handleKeyUp();
  },
};

$SD.on('connected', () => {
  $SD.on(`${ACTION_UUID}.willAppear`, (jsonObj) => action.onWillAppear(jsonObj));
  $SD.on(`${ACTION_UUID}.willDisappear`, (jsonObj) => action.onWillDisappear(jsonObj));
  $SD.on(`${ACTION_UUID}.didReceiveSettings`, (jsonObj) => action.onDidReceiveSettings(jsonObj));
  $SD.on(`${ACTION_UUID}.keyDown`, (jsonObj) => action.onKeyDown(jsonObj));
  $SD.on(`${ACTION_UUID}.keyUp`, (jsonObj) => action.onKeyUp(jsonObj));
});
