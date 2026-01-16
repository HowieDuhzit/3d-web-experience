import styles from "../Networked3dWebExperience.module.css";

export type ExperienceUIConfig = {
  roomName?: string;
  showMenuOnStart?: boolean;
  showHelpOnStart?: boolean;
  defaultUiScale?: number;
};

export type ExperienceUIHandlers = {
  onEnterExperience: () => void;
  onOpenAvatarEditor: () => void;
  onUpdateDisplayName: (displayName: string) => void;
  onToggleChat: (enabled: boolean) => void;
  onTogglePostProcessing: (enabled: boolean) => void;
  onToggleOrbitalCamera: (enabled: boolean) => void;
  onToggleHighContrast: (enabled: boolean) => void;
  onUpdateUiScale: (scale: number) => void;
  onSendEmote: (emote: string) => void;
  onSendDirectMessage: (recipientName: string, message: string) => void;
};

type StoredPreferences = {
  chatEnabled: boolean;
  postProcessingEnabled: boolean;
  orbitalCameraEnabled: boolean;
  highContrastEnabled: boolean;
  uiScale: number;
  objectivesCompleted: Record<string, boolean>;
  followedUsers: Record<string, boolean>;
  mutedUsers: Record<string, boolean>;
};

const defaultPreferences: StoredPreferences = {
  chatEnabled: true,
  postProcessingEnabled: true,
  orbitalCameraEnabled: true,
  highContrastEnabled: false,
  uiScale: 1,
  objectivesCompleted: {},
  followedUsers: {},
  mutedUsers: {},
};

const preferenceStorageKey = "mml-experience-ui-preferences";

export class ExperienceUI {
  private root = document.createElement("div");
  private menuOverlay = document.createElement("div");
  private hud = document.createElement("div");
  private statusPill = document.createElement("div");
  private roomLabel = document.createElement("div");
  private userCountLabel = document.createElement("div");
  private playerList = document.createElement("div");
  private socialPanel = document.createElement("div");
  private directMessagePanel = document.createElement("div");
  private helpOverlay = document.createElement("div");
  private settingsPanel = document.createElement("div");
  private objectivesPanel = document.createElement("div");
  private achievementsPanel = document.createElement("div");
  private objectiveCheckboxes = new Map<string, HTMLInputElement>();
  private preferences: StoredPreferences;

  constructor(
    private holderElement: HTMLElement,
    private handlers: ExperienceUIHandlers,
    private config: ExperienceUIConfig = {},
  ) {
    this.preferences = this.loadPreferences();
    this.buildUI();
    this.applyPreferences();
  }

  private loadPreferences(): StoredPreferences {
    try {
      const stored = window.localStorage.getItem(preferenceStorageKey);
      if (!stored) {
        return { ...defaultPreferences, uiScale: this.config.defaultUiScale ?? 1 };
      }
      const parsed = JSON.parse(stored) as Partial<StoredPreferences>;
      return {
        ...defaultPreferences,
        ...parsed,
        uiScale: parsed.uiScale ?? this.config.defaultUiScale ?? 1,
      };
    } catch {
      return { ...defaultPreferences, uiScale: this.config.defaultUiScale ?? 1 };
    }
  }

  private savePreferences() {
    window.localStorage.setItem(preferenceStorageKey, JSON.stringify(this.preferences));
  }

  private buildUI() {
    this.root.className = styles.experienceUiRoot;
    this.root.style.position = "absolute";
    this.root.style.inset = "0";
    this.root.style.pointerEvents = "none";
    this.holderElement.appendChild(this.root);

    this.buildMenuOverlay();
    this.buildHud();
    this.buildHelpOverlay();
    this.buildSettingsPanel();
    this.buildObjectivesPanel();
    this.buildAchievementsPanel();
    this.buildSocialPanel();
    this.buildDirectMessagePanel();
  }

  private buildMenuOverlay() {
    this.menuOverlay.className = styles.experienceMenuOverlay;
    this.menuOverlay.style.pointerEvents = "auto";
    this.root.appendChild(this.menuOverlay);

    const menuCard = document.createElement("div");
    menuCard.className = styles.experienceMenuCard;

    const title = document.createElement("h1");
    title.textContent = "Welcome to the 3D Web Experience";

    const subtitle = document.createElement("p");
    subtitle.textContent =
      "Configure your identity, review the controls, and jump into a shared world.";

    const displayNameLabel = document.createElement("label");
    displayNameLabel.textContent = "Display name";

    const displayNameInput = document.createElement("input");
    displayNameInput.type = "text";
    displayNameInput.placeholder = "Enter your display name";
    displayNameInput.className = styles.experienceMenuInput;

    const updateDisplayNameButton = document.createElement("button");
    updateDisplayNameButton.type = "button";
    updateDisplayNameButton.textContent = "Save display name";
    updateDisplayNameButton.className = styles.experiencePrimaryButton;
    updateDisplayNameButton.addEventListener("click", () => {
      if (!displayNameInput.value.trim()) {
        return;
      }
      this.handlers.onUpdateDisplayName(displayNameInput.value.trim());
    });

    const buttonRow = document.createElement("div");
    buttonRow.className = styles.experienceMenuButtonRow;

    const openAvatarButton = document.createElement("button");
    openAvatarButton.type = "button";
    openAvatarButton.textContent = "Customize avatar";
    openAvatarButton.className = styles.experienceSecondaryButton;
    openAvatarButton.addEventListener("click", () => {
      this.handlers.onOpenAvatarEditor();
    });

    const enterButton = document.createElement("button");
    enterButton.type = "button";
    enterButton.textContent = "Enter experience";
    enterButton.className = styles.experiencePrimaryButton;
    enterButton.addEventListener("click", () => {
      this.setMenuVisible(false);
      this.handlers.onEnterExperience();
    });

    buttonRow.append(openAvatarButton, enterButton);

    menuCard.append(title, subtitle, displayNameLabel, displayNameInput, updateDisplayNameButton);
    menuCard.appendChild(buttonRow);

    const hint = document.createElement("p");
    hint.className = styles.experienceMenuHint;
    hint.textContent =
      "Need help? Use the Help button in the HUD to see controls and tips.";

    menuCard.appendChild(hint);

    this.menuOverlay.appendChild(menuCard);
    this.setMenuVisible(this.config.showMenuOnStart ?? true);
  }

  private buildHud() {
    this.hud.className = styles.experienceHud;
    this.root.appendChild(this.hud);

    const statusContainer = document.createElement("div");
    statusContainer.className = styles.experienceHudBlock;

    this.statusPill.className = styles.experienceStatusPill;
    this.statusPill.textContent = "Connecting...";

    this.roomLabel.className = styles.experienceRoomLabel;
    this.roomLabel.textContent = this.config.roomName ?? "Shared Space";

    this.userCountLabel.className = styles.experienceUserCount;
    this.userCountLabel.textContent = "0 online";

    statusContainer.append(this.statusPill, this.roomLabel, this.userCountLabel);

    const actionsContainer = document.createElement("div");
    actionsContainer.className = styles.experienceHudBlock;

    const helpButton = document.createElement("button");
    helpButton.type = "button";
    helpButton.textContent = "Help";
    helpButton.className = styles.experienceSecondaryButton;
    helpButton.addEventListener("click", () => {
      this.setHelpVisible(true);
    });

    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.textContent = "Settings";
    settingsButton.className = styles.experienceSecondaryButton;
    settingsButton.addEventListener("click", () => {
      this.setSettingsVisible(true);
    });

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.textContent = "Menu";
    menuButton.className = styles.experienceSecondaryButton;
    menuButton.addEventListener("click", () => {
      this.setMenuVisible(true);
    });

    actionsContainer.append(menuButton, helpButton, settingsButton);

    const emoteRow = document.createElement("div");
    emoteRow.className = styles.experienceEmoteRow;
    ["👋", "🎉", "👍", "🚀"].forEach((emote) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = emote;
      button.className = styles.experienceEmoteButton;
      button.addEventListener("click", () => {
        this.handlers.onSendEmote(emote);
      });
      emoteRow.appendChild(button);
    });

    this.playerList.className = styles.experiencePlayerList;
    this.playerList.textContent = "No players yet";

    this.hud.append(statusContainer, actionsContainer, emoteRow, this.playerList);
  }

  private buildHelpOverlay() {
    this.helpOverlay.className = styles.experienceOverlay;
    this.root.appendChild(this.helpOverlay);

    const card = document.createElement("div");
    card.className = styles.experienceOverlayCard;

    const title = document.createElement("h2");
    title.textContent = "Controls & Tips";

    const list = document.createElement("ul");
    list.innerHTML = `
      <li>Move: WASD or arrow keys</li>
      <li>Look: mouse or touch drag</li>
      <li>Jump: Space</li>
      <li>Toggle camera mode: C</li>
      <li>Chat: Press Enter to open chat</li>
    `;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.className = styles.experiencePrimaryButton;
    closeButton.addEventListener("click", () => {
      this.setHelpVisible(false);
    });

    card.append(title, list, closeButton);
    this.helpOverlay.appendChild(card);
    this.setHelpVisible(this.config.showHelpOnStart ?? false);
  }

  private buildSettingsPanel() {
    this.settingsPanel.className = styles.experienceOverlay;
    this.root.appendChild(this.settingsPanel);

    const card = document.createElement("div");
    card.className = styles.experienceOverlayCard;

    const title = document.createElement("h2");
    title.textContent = "Experience Settings";

    const chatToggle = this.createToggleRow(
      "Chat",
      this.preferences.chatEnabled,
      (value) => {
        this.preferences.chatEnabled = value;
        this.handlers.onToggleChat(value);
        this.savePreferences();
      },
    );

    const postProcessingToggle = this.createToggleRow(
      "Post-processing",
      this.preferences.postProcessingEnabled,
      (value) => {
        this.preferences.postProcessingEnabled = value;
        this.handlers.onTogglePostProcessing(value);
        this.savePreferences();
      },
    );

    const orbitalCameraToggle = this.createToggleRow(
      "Orbital camera",
      this.preferences.orbitalCameraEnabled,
      (value) => {
        this.preferences.orbitalCameraEnabled = value;
        this.handlers.onToggleOrbitalCamera(value);
        this.savePreferences();
      },
    );

    const highContrastToggle = this.createToggleRow(
      "High contrast UI",
      this.preferences.highContrastEnabled,
      (value) => {
        this.preferences.highContrastEnabled = value;
        this.handlers.onToggleHighContrast(value);
        this.savePreferences();
      },
    );

    const scaleRow = document.createElement("div");
    scaleRow.className = styles.experienceSettingsRow;

    const scaleLabel = document.createElement("label");
    scaleLabel.textContent = "UI scale";

    const scaleInput = document.createElement("input");
    scaleInput.type = "range";
    scaleInput.min = "0.8";
    scaleInput.max = "1.4";
    scaleInput.step = "0.1";
    scaleInput.value = this.preferences.uiScale.toString();
    scaleInput.addEventListener("input", () => {
      const scale = Number(scaleInput.value);
      this.preferences.uiScale = scale;
      this.handlers.onUpdateUiScale(scale);
      this.savePreferences();
    });

    scaleRow.append(scaleLabel, scaleInput);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.className = styles.experiencePrimaryButton;
    closeButton.addEventListener("click", () => {
      this.setSettingsVisible(false);
    });

    card.append(
      title,
      chatToggle,
      postProcessingToggle,
      orbitalCameraToggle,
      highContrastToggle,
      scaleRow,
      closeButton,
    );
    this.settingsPanel.appendChild(card);
    this.setSettingsVisible(false);
  }

  private buildObjectivesPanel() {
    this.objectivesPanel.className = styles.experienceObjectivesPanel;
    this.root.appendChild(this.objectivesPanel);

    const title = document.createElement("h3");
    title.textContent = "Objectives";
    this.objectivesPanel.appendChild(title);

    const objectives = [
      { id: "explore", label: "Explore the plaza" },
      { id: "chat", label: "Say hello in chat" },
      { id: "emote", label: "Send an emote reaction" },
      { id: "follow", label: "Follow another player" },
    ];

    objectives.forEach((objective) => {
      const row = document.createElement("label");
      row.className = styles.experienceObjectiveRow;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!this.preferences.objectivesCompleted[objective.id];
      checkbox.addEventListener("change", () => {
        this.preferences.objectivesCompleted[objective.id] = checkbox.checked;
        this.savePreferences();
      });
      this.objectiveCheckboxes.set(objective.id, checkbox);

      const span = document.createElement("span");
      span.textContent = objective.label;

      row.append(checkbox, span);
      this.objectivesPanel.appendChild(row);
    });
  }

  private buildAchievementsPanel() {
    this.achievementsPanel.className = styles.experienceAchievementsPanel;
    this.root.appendChild(this.achievementsPanel);

    const title = document.createElement("h3");
    title.textContent = "Achievements";

    const list = document.createElement("ul");
    list.innerHTML = `
      <li>First Steps: Enter the world</li>
      <li>Friendly Face: Send your first emote</li>
      <li>Connector: Follow another player</li>
      <li>Explorer: Visit three landmarks</li>
    `;

    this.achievementsPanel.append(title, list);
  }

  private createToggleRow(
    labelText: string,
    initialValue: boolean,
    onChange: (value: boolean) => void,
  ) {
    const row = document.createElement("label");
    row.className = styles.experienceSettingsRow;

    const label = document.createElement("span");
    label.textContent = labelText;

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = initialValue;
    toggle.addEventListener("change", () => {
      onChange(toggle.checked);
    });

    row.append(label, toggle);
    return row;
  }

  private applyPreferences() {
    this.handlers.onToggleChat(this.preferences.chatEnabled);
    this.handlers.onTogglePostProcessing(this.preferences.postProcessingEnabled);
    this.handlers.onToggleOrbitalCamera(this.preferences.orbitalCameraEnabled);
    this.handlers.onToggleHighContrast(this.preferences.highContrastEnabled);
    this.handlers.onUpdateUiScale(this.preferences.uiScale);
  }

  private buildSocialPanel() {
    this.socialPanel.className = styles.experienceSocialPanel;
    const title = document.createElement("h3");
    title.textContent = "Social";

    const description = document.createElement("p");
    description.textContent = "Follow, mute, or message other players.";
    description.className = styles.experienceMutedText;

    this.socialPanel.append(title, description);
    this.root.appendChild(this.socialPanel);
  }

  private buildDirectMessagePanel() {
    this.directMessagePanel.className = styles.experienceDirectMessagePanel;
    const title = document.createElement("h3");
    title.textContent = "Quick DM";

    const info = document.createElement("p");
    info.textContent = "Send a message to a player (broadcast with /dm).";
    info.className = styles.experienceMutedText;

    const recipientInput = document.createElement("input");
    recipientInput.type = "text";
    recipientInput.placeholder = "Player name";
    recipientInput.className = styles.experienceMenuInput;

    const messageInput = document.createElement("input");
    messageInput.type = "text";
    messageInput.placeholder = "Message";
    messageInput.className = styles.experienceMenuInput;

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.textContent = "Send DM";
    sendButton.className = styles.experiencePrimaryButton;
    sendButton.addEventListener("click", () => {
      const recipient = recipientInput.value.trim();
      const message = messageInput.value.trim();
      if (!recipient || !message) {
        return;
      }
      this.handlers.onSendDirectMessage(recipient, message);
      recipientInput.value = "";
      messageInput.value = "";
      this.completeObjective("chat");
    });

    this.directMessagePanel.append(title, info, recipientInput, messageInput, sendButton);
    this.root.appendChild(this.directMessagePanel);
  }

  public updateConnectionStatus(status: string) {
    this.statusPill.textContent = status;
  }

  public updateRoomName(roomName: string) {
    this.roomLabel.textContent = roomName;
  }

  public updateUserCount(count: number) {
    this.userCountLabel.textContent = `${count} online`;
  }

  public updatePlayerList(users: Array<{ id: number; name: string }>) {
    this.playerList.innerHTML = "";
    const title = document.createElement("h4");
    title.textContent = "Players";
    this.playerList.appendChild(title);

    if (users.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No players yet";
      this.playerList.appendChild(empty);
      return;
    }

    users.forEach((user) => {
      const row = document.createElement("div");
      row.className = styles.experiencePlayerRow;
      const label = document.createElement("span");
      const userLabel = user.name || `User ${user.id}`;
      label.textContent = userLabel;

      const actions = document.createElement("div");
      actions.className = styles.experiencePlayerActions;

      const followButton = document.createElement("button");
      followButton.type = "button";
      const isFollowed = !!this.preferences.followedUsers[userLabel];
      followButton.textContent = isFollowed ? "Following" : "Follow";
      followButton.className = styles.experienceSecondaryButton;
      followButton.addEventListener("click", () => {
        const next = !this.preferences.followedUsers[userLabel];
        this.preferences.followedUsers[userLabel] = next;
        followButton.textContent = next ? "Following" : "Follow";
        this.savePreferences();
        if (next) {
          this.completeObjective("follow");
        }
      });

      const muteButton = document.createElement("button");
      muteButton.type = "button";
      const isMuted = !!this.preferences.mutedUsers[userLabel];
      muteButton.textContent = isMuted ? "Muted" : "Mute";
      muteButton.className = styles.experienceSecondaryButton;
      muteButton.addEventListener("click", () => {
        const next = !this.preferences.mutedUsers[userLabel];
        this.preferences.mutedUsers[userLabel] = next;
        muteButton.textContent = next ? "Muted" : "Mute";
        this.savePreferences();
      });

      const dmButton = document.createElement("button");
      dmButton.type = "button";
      dmButton.textContent = "DM";
      dmButton.className = styles.experienceSecondaryButton;
      dmButton.addEventListener("click", () => {
        this.directMessagePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });

      actions.append(followButton, muteButton, dmButton);
      row.append(label, actions);
      this.playerList.appendChild(row);
    });
  }

  public setMenuVisible(visible: boolean) {
    this.menuOverlay.classList.toggle(styles.isVisible, visible);
    this.menuOverlay.style.display = visible ? "flex" : "none";
  }

  public setHelpVisible(visible: boolean) {
    this.helpOverlay.classList.toggle(styles.isVisible, visible);
    this.helpOverlay.style.display = visible ? "flex" : "none";
  }

  public setSettingsVisible(visible: boolean) {
    this.settingsPanel.classList.toggle(styles.isVisible, visible);
    this.settingsPanel.style.display = visible ? "flex" : "none";
  }

  public completeObjective(objectiveId: string) {
    this.preferences.objectivesCompleted[objectiveId] = true;
    const checkbox = this.objectiveCheckboxes.get(objectiveId);
    if (checkbox) {
      checkbox.checked = true;
    }
    this.savePreferences();
  }
}
