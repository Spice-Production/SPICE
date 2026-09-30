'use client';

/* eslint-disable react-hooks/refs -- topbarProfileShellRef is a plain DOM RefObject owned by
   SpiceApp's model; attaching it via a JSX `ref` prop is the sanctioned way to hand it this
   menu's container node so SpiceApp's own outside-click effect keeps working, not a
   render-time read of `.current`. The compiler-backed rule can't tell that apart once the
   ref flows through the shared model object, so it over-reports across this file. */

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { Avatar, Portal, Separator, useAnchoredPosition, useDismiss } from '../primitives';
import { handleTrayArrowKeys, trayItems } from './tray-keyboard';
import s from './topbar.module.css';

/**
 * Avatar → profile menu, mirroring `app-topbar__profile-menu` (account,
 * settings, sign out) plus local profile switching and feedback, both of
 * which classic exposes elsewhere via the same model handlers. The trigger
 * wrapper carries `topbarProfileShellRef`, which SpiceApp's own
 * outside-click effect depends on; the portaled panel stops its pointerdown
 * from bubbling to `document` so that legacy listener never races a click's
 * mousedown against its own click.
 */
export function ProfileMenu() {
  const m = useSpiceUi();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismiss(m.profileMenuOpen, [m.topbarProfileShellRef, panelRef], () => m.setProfileMenuOpen(false));
  const { style, measured } = useAnchoredPosition(m.topbarProfileShellRef, panelRef, m.profileMenuOpen, {
    side: 'bottom',
    align: 'end',
    offset: 8,
  });

  const close = () => m.setProfileMenuOpen(false);

  // Menu keyboard behavior: focus the first item once the panel is positioned (a
  // hidden, still-measuring panel cannot take focus), arrows/Home/End move between
  // items, Escape and Tab close and return to the trigger.
  useEffect(() => {
    if (m.profileMenuOpen && measured) trayItems(panelRef.current, '[role^="menuitem"]')[0]?.focus({ preventScroll: true });
  }, [m.profileMenuOpen, measured]);

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    handleTrayArrowKeys(event, trayItems(panelRef.current, '[role^="menuitem"]'));
  };
  const openFeedback = () => {
    close();
    m.setSelectedPlaylist(null);
    m.setSelectedUser(null);
    m.setActiveSettingsSection('feedback-support');
    m.setCurrentPage('settings');
  };

  return (
    <div className={s.trayAnchor} ref={m.topbarProfileShellRef}>
      <button
        ref={triggerRef}
        type="button"
        className={s.profileTrigger}
        aria-label={`Open profile menu for ${m.activeProfile.displayName}`}
        aria-haspopup="menu"
        aria-expanded={m.profileMenuOpen}
        onClick={() => {
          m.setProfileMenuOpen((open) => !open);
          m.setNotificationTrayOpen(false);
          m.setTopbarSearchTrayOpen(false);
        }}
      >
        <Avatar key={m.activeProfile.id} src={m.activeProfile.avatarUrl} name={m.activeProfile.displayName} gradient={m.activeProfile.gradient} size={30} />
        <span className={s.profileCopy}>
          <span className={s.profileName}>{m.activeProfile.displayName}</span>
          <span className={s.profileRole}>{m.isMounted && m.cloudUser?.accountRole ? `${m.cloudUser.accountRole} account` : 'Local profile'}</span>
        </span>
      </button>

      {m.profileMenuOpen ? (
        <Portal>
        <div
          ref={panelRef}
          className={`${s.tray} ${s.profilePanel}`}
          style={style}
          data-measuring={measured ? undefined : 'true'}
          role="menu"
          aria-label="Profile actions"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={onPanelKeyDown}
        >
          <div className={s.profileIdentity}>
            <Avatar key={m.activeProfile.id} src={m.activeProfile.avatarUrl} name={m.activeProfile.displayName} gradient={m.activeProfile.gradient} size={36} />
            <span className={s.profileIdentityText}>
              <span className={s.profileIdentityName}>{m.activeProfile.displayName}</span>
              <span className={s.profileIdentityHandle}>{m.cloudUsername ? `@${m.cloudUsername}` : 'Stored on this device'}</span>
            </span>
          </div>
          <Separator />

          <div className={s.profileMenuGroup}>
            <button
              type="button"
              role="menuitem"
              className={s.profileSwitchRow}
              onClick={() => {
                close();
                m.openAccountFromTopbar();
              }}
            >
              <Icon name="user" size={16} />
              <span className={s.profileSwitchName}>Account and profile</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={s.profileSwitchRow}
              onClick={() => {
                close();
                m.openSettingsFromTopbar();
              }}
            >
              <Icon name="settings" size={16} />
              <span className={s.profileSwitchName}>Settings</span>
            </button>
          </div>

          {m.profiles.length > 1 ? (
            <>
              <Separator />
              <div className={`${s.traySectionTitle} ${s.profileMenuLabel}`}>
                <span>Switch profile</span>
              </div>
              <div className={s.profileMenuGroup}>
                {m.profiles.map((profile) => {
                  const isActive = profile.id === m.activeProfileId;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={s.profileSwitchRow}
                      onClick={() => {
                        close();
                        if (!isActive) m.switchProfile(profile.id);
                      }}
                    >
                      <Avatar src={profile.avatarUrl} name={profile.displayName} gradient={profile.gradient} size={22} />
                      <span className={s.profileSwitchName}>{profile.displayName}</span>
                      {isActive ? (
                        <span className={s.profileSwitchCheck}>
                          <Icon name="check" size={14} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <Separator />
          <div className={s.profileMenuGroup}>
            <button type="button" role="menuitem" className={s.profileSwitchRow} onClick={openFeedback}>
              <Icon name="messageSquare" size={16} />
              <span className={s.profileSwitchName}>Feedback</span>
            </button>
            {m.cloudToken ? (
              <button
                type="button"
                role="menuitem"
                className={s.profileSwitchRow}
                data-destructive="true"
                onClick={() => {
                  close();
                  m.handleLogout();
                }}
              >
                <Icon name="logOut" size={16} />
                <span className={s.profileSwitchName}>Sign out of SPICE Cloud</span>
              </button>
            ) : null}
          </div>
        </div>
        </Portal>
      ) : null}
    </div>
  );
}
