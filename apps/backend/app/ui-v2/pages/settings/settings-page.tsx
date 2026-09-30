'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useScrollContainer, useSpiceUi } from '../../context';
import { Icon } from '../../icons';
import { PageHeader, Select, useMediaQuery } from '../../primitives';
import { ConnectSettings } from './connect-settings';
import { DesktopSettings } from './desktop-settings';
import { PersonalizeSettings } from './personalize-settings';
import { PlaybackSettings } from './playback-settings';
import { SETTINGS_GROUPS, settingsGroupForSection, visibleSettingsGroups, type SettingsGroupId } from './settings-nav';
import { SupportSettings } from './support-settings';
import s from './settings.module.css';

/**
 * The classic scroll-spy (it also watches the v2 #main) reports this section
 * whenever nothing has scrolled past its marker, so it is not a deep link.
 */
const CLASSIC_SPY_FALLBACK_SECTION = 'theme-accent';
/** A section counts as current once its top is this close to the scroller's top. */
const SPY_OFFSET = 96;
const SCROLL_MARGIN = 16;
/**
 * Below this width the sidebar plus the settings nav would squeeze rows into a
 * ~300px column, so the group nav becomes a picker on top (phones and tablets).
 */
const COMPACT_QUERY = '(max-width: 1100px)';
/**
 * After a click or link scrolls to a section, the scroll-spy stays quiet this
 * long (extended while the scroll is still moving) so the chosen item remains
 * highlighted even when the page is too short to bring it to the top.
 */
const SPY_LOCK_MS = 700;
const SPY_LOCK_SETTLE_MS = 160;
/** The classic scroll-spy reports within a frame of a scroll; a change after this long is an explicit link. */
const LINK_IDLE_MS = 300;

/** Timestamp for scroll bookkeeping; only called from effects and event handlers. */
const now = () => performance.now();

function scrollToSection(container: HTMLElement | null, id: string, smooth: boolean) {
  const target = document.getElementById(id);
  if (!target) return;
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
  if (!container) {
    target.scrollIntoView({ block: 'start', behavior });
    return;
  }
  const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - SCROLL_MARGIN;
  container.scrollTo({ top: Math.max(0, top), behavior });
}

function GroupContent({ id }: { id: SettingsGroupId }) {
  switch (id) {
    case 'playback':
      return <PlaybackSettings />;
    case 'connect':
      return <ConnectSettings />;
    case 'desktop':
      return <DesktopSettings />;
    case 'support':
      return <SupportSettings />;
    case 'personalize':
    default:
      return <PersonalizeSettings />;
  }
}

export function SettingsPage() {
  const m = useSpiceUi();
  const scrollRef = useScrollContainer();
  const compact = useMediaQuery(COMPACT_QUERY);
  const pickerId = useId();

  // Deep link: open the group holding the requested section and scroll to it once.
  const [initialLink] = useState(() => {
    const section = m.activeSettingsSection;
    const groupId = settingsGroupForSection(section);
    const group = SETTINGS_GROUPS.find((candidate) => candidate.id === groupId);
    const isGroupStart = group?.items[0]?.id === section;
    return {
      groupId: groupId ?? ('personalize' as SettingsGroupId),
      scrollTarget: groupId && !isGroupStart && section !== CLASSIC_SPY_FALLBACK_SECTION ? section : null,
    };
  });
  const [groupId, setGroupId] = useState<SettingsGroupId>(initialLink.groupId);
  const [spySection, setSpySection] = useState<string | null>(initialLink.scrollTarget);
  const [scrollRequest, setScrollRequest] = useState<{ id: string } | null>(
    initialLink.scrollTarget ? { id: initialLink.scrollTarget } : null,
  );
  const [seenSection, setSeenSection] = useState(m.activeSettingsSection);
  const lockUntilRef = useRef(0);
  const lastScrollRef = useRef(0);
  const handledSectionRef = useRef(m.activeSettingsSection);
  const { activeSettingsSection, setActiveSettingsSection } = m;

  const groups = visibleSettingsGroups(m);
  const activeGroup = groups.find((group) => group.id === groupId) ?? groups[0];
  const sectionIds = activeGroup.items.map((item) => item.id);
  const sectionKey = sectionIds.join(' ');
  const currentSection = spySection && sectionIds.includes(spySection) ? spySection : sectionIds[0];
  const smoothScroll = m.motionLevel !== 'off';

  // A link into another group while Settings is open (the profile menu's
  // Feedback item) switches groups in the same render, then scrolls below.
  if (seenSection !== activeSettingsSection) {
    setSeenSection(activeSettingsSection);
    const linkedGroup = groups.find((group) => group.items.some((item) => item.id === activeSettingsSection));
    if (linkedGroup && linkedGroup.id !== activeGroup.id && activeSettingsSection !== CLASSIC_SPY_FALLBACK_SECTION) {
      setGroupId(linkedGroup.id);
      setSpySection(activeSettingsSection);
      setScrollRequest({ id: activeSettingsSection });
    }
  }

  useEffect(() => {
    if (!scrollRequest) return;
    // After the shell resets the scroll position for the new route.
    const frame = requestAnimationFrame(() => {
      lockUntilRef.current = now() + SPY_LOCK_MS;
      scrollToSection(scrollRef?.current ?? null, scrollRequest.id, false);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollRequest, scrollRef]);

  // Same-group link (already on Support, then Feedback from the profile menu):
  // nothing else scrolls there, so bring the section into view.
  useEffect(() => {
    if (handledSectionRef.current === activeSettingsSection) return;
    handledSectionRef.current = activeSettingsSection;
    if (activeSettingsSection === CLASSIC_SPY_FALLBACK_SECTION || activeSettingsSection === currentSection) return;
    if (!sectionKey.split(' ').includes(activeSettingsSection)) return;
    if (now() - lastScrollRef.current < LINK_IDLE_MS) return;
    lockUntilRef.current = now() + SPY_LOCK_MS;
    scrollToSection(scrollRef?.current ?? null, activeSettingsSection, smoothScroll);
  }, [activeSettingsSection, currentSection, sectionKey, scrollRef, smoothScroll]);

  // Highlights the section in view for the in-page section list.
  useEffect(() => {
    const container = scrollRef?.current;
    if (!container) return;
    const ids = sectionKey.split(' ');
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (now() < lockUntilRef.current) return;
      const top = container.getBoundingClientRect().top;
      let current = ids[0];
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top - top <= SPY_OFFSET) current = id;
      }
      const scrollable = container.scrollHeight - container.clientHeight > 4;
      if (scrollable && container.scrollTop > 0 && container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
        current = ids[ids.length - 1];
      }
      setSpySection(current);
    };
    const onScroll = () => {
      const timestamp = now();
      lastScrollRef.current = timestamp;
      if (timestamp < lockUntilRef.current) {
        lockUntilRef.current = Math.max(lockUntilRef.current, timestamp + SPY_LOCK_SETTLE_MS);
        return;
      }
      if (!compact && !frame) frame = requestAnimationFrame(measure);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, sectionKey, compact]);

  const selectGroup = (id: SettingsGroupId) => {
    const container = scrollRef?.current ?? null;
    if (id === activeGroup.id) {
      container?.scrollTo({ top: 0, behavior: smoothScroll ? 'smooth' : 'auto' });
      return;
    }
    setGroupId(id);
    setSpySection(null);
    const firstSection = groups.find((group) => group.id === id)?.items[0]?.id;
    if (firstSection) setActiveSettingsSection(firstSection);
    container?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const jumpToSection = (id: string) => {
    setSpySection(id);
    setActiveSettingsSection(id);
    lockUntilRef.current = now() + SPY_LOCK_MS;
    scrollToSection(scrollRef?.current ?? null, id, smoothScroll);
  };

  return (
    <>
      <PageHeader title="Settings" description="Customize how SPICE looks, plays, and connects across your devices." />
      <div className={s.layout}>
        {compact ? (
          <div className={s.mobilePicker}>
            <Select
              id={pickerId}
              label="Settings category"
              value={activeGroup.id}
              onChange={selectGroup}
              options={groups.map((group) => ({ value: group.id, label: group.label }))}
            />
          </div>
        ) : (
          <nav className={s.nav} aria-label="Settings">
            <ul className={s.navList}>
              {groups.map((group) => {
                const active = group.id === activeGroup.id;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      className={s.navItem}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => selectGroup(group.id)}
                    >
                      <Icon name={group.icon} size={16} />
                      <span className={s.navItemLabel}>{group.label}</span>
                    </button>
                    {active && group.items.length > 1 ? (
                      <ul className={s.navSubList} aria-label={`${group.label} sections`}>
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={s.navSubItem}
                              aria-current={item.id === currentSection ? 'location' : undefined}
                              onClick={() => jumpToSection(item.id)}
                            >
                              {item.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className={s.content}>
          <div className={s.groupHeader}>
            <h2 className={s.groupTitle}>{activeGroup.label}</h2>
            <p className={s.groupDescription}>{activeGroup.description}</p>
          </div>
          <div key={activeGroup.id} className={s.groupBody}>
            <GroupContent id={activeGroup.id} />
          </div>
        </div>
      </div>
    </>
  );
}
