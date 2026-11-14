import { useEffect, useRef, useState } from 'react';

/** Pull-to-refresh for the app's main content.
 *
 * Wraps the scrollable content (.app-content, or the chat's .chat-scroll
 * when the Buddy tab is open). Pulling down from the top of the page drags
 * the content down and shows a refresh indicator; releasing past the
 * threshold calls onRefresh. Works in the Capacitor WebView, where the
 * browser's native pull-to-refresh does not exist.
 *
 * The scroll container is found at touch time: the chat tab scrolls inside
 * .chat-scroll, every other tab scrolls inside .app-content. Only engages
 * when that container is already scrolled to the top. */

const TRIGGER_PX = 70;
const MAX_PULL_PX = 120;

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Always call the latest onRefresh (the parent recreates it every
  // render so it closes over fresh data); the touch listeners below are
  // attached once and read through this ref.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const tracking = useRef<{
    startY: number;
    scrollEl: HTMLElement | null;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const findScrollEl = (): HTMLElement | null => {
      // The chat tab scrolls in .chat-scroll; every other tab scrolls in
      // .app-content. The chat list is only present when the Buddy tab is
      // open, so prefer it when it exists.
      const chatScroll = wrap.querySelector<HTMLElement>('.chat-scroll');
      if (chatScroll) return chatScroll;
      return wrap.querySelector<HTMLElement>('.app-content');
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      const touch = e.touches[0];
      if (!touch) return;
      const scrollEl = findScrollEl();
      // Only engage when the page is already at the very top.
      if (scrollEl && scrollEl.scrollTop <= 0) {
        tracking.current = { startY: touch.clientY, scrollEl, active: true };
      } else {
        tracking.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = tracking.current;
      if (!t || !t.active) return;
      const touch = e.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - t.startY;
      // Only pull down. Scrolling up is the page's own business.
      if (deltaY <= 0) {
        setPull(0);
        return;
      }
      // Stop the page from scrolling while we pull, and drag the content
      // down with resistance so it feels weighty.
      e.preventDefault();
      setPull(Math.min(MAX_PULL_PX, deltaY * 0.5));
    };

    const onTouchEnd = () => {
      const t = tracking.current;
      tracking.current = null;
      if (!t || !t.active) {
        setPull(0);
        return;
      }
      setPull((current) => {
        if (current >= TRIGGER_PX) {
          setRefreshing(true);
          void onRefreshRef.current().finally(() => {
            setRefreshing(false);
            setPull(0);
          });
          return TRIGGER_PX;
        }
        return 0;
      });
    };

    wrap.addEventListener('touchstart', onTouchStart, { passive: true });
    wrap.addEventListener('touchmove', onTouchMove, { passive: false });
    wrap.addEventListener('touchend', onTouchEnd, { passive: true });
    wrap.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart);
      wrap.removeEventListener('touchmove', onTouchMove);
      wrap.removeEventListener('touchend', onTouchEnd);
      wrap.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [refreshing]);

  const ready = pull >= TRIGGER_PX;

  return (
    <div
      ref={wrapRef}
      className="ptr-wrap"
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        className="ptr-indicator"
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: 'var(--muted, #9a938a)',
          fontSize: '0.9rem',
          pointerEvents: 'none',
          opacity: refreshing ? 1 : Math.min(1, pull / TRIGGER_PX),
          transform: `translateY(${refreshing ? 0 : pull - 56}px)`,
          transition: refreshing || pull === 0 ? 'transform 0.25s ease, opacity 0.25s ease' : 'none',
        }}
      >
        {refreshing ? (
          <>
            <span className="ptr-spinner" />
            <span>Refreshing…</span>
          </>
        ) : (
          <>
            <span style={{ display: 'inline-block', transform: ready ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>↓</span>
            <span>{ready ? 'Release to refresh' : 'Pull to refresh'}</span>
          </>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${refreshing ? TRIGGER_PX : pull}px)`,
          transition: refreshing || pull === 0 ? 'transform 0.25s ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
