import { useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '@/theme/layout';

function clampFont(size: number, fontScale: number, maxScale = 1.12) {
  return Math.round(size * Math.min(fontScale, maxScale));
}

function useResolvedTabBarHeight(insets: { bottom: number }): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  if (typeof tabBarHeight === 'number' && tabBarHeight > 0) {
    return tabBarHeight;
  }
  // Stack/modal screens outside Bottom Tab Navigator — safe area only.
  return insets.bottom;
}

export function useScreenLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const resolvedTabBarHeight = useResolvedTabBarHeight(insets);

  const isSmallPhone = width < 360;
  const isTablet = width >= 768;
  const isLandscape = width > height;

  const gutter = isTablet ? 28 : isSmallPhone ? 14 : 18;
  const contentWidth = isTablet
    ? Math.min(layout.maxContentWidth, width - gutter * 2)
    : width - gutter * 2;

  const sideInset = isTablet ? Math.max(gutter, (width - contentWidth) / 2) : gutter;

  return {
    width,
    height,
    fontScale,
    insets,
    tabBarHeight: resolvedTabBarHeight,
    isSmallPhone,
    isTablet,
    isLandscape,
    gutter,
    sideInset,
    contentWidth,
    /** Padding for scroll content above tab bar */
    scrollBottomPad: resolvedTabBarHeight + 20,
    /** Sticky footer sits above tab bar */
    stickyFooterBottom: resolvedTabBarHeight,
    largeTitleSize: clampFont(
      isSmallPhone ? 30 : isTablet ? 38 : layout.typography.largeTitle,
      fontScale,
      1.08,
    ),
    titleSize: clampFont(isSmallPhone ? 20 : isTablet ? 26 : layout.typography.title2, fontScale),
    subtitleSize: clampFont(layout.typography.subhead, fontScale, 1.08),
    bodySize: clampFont(layout.typography.body, fontScale, 1.08),
    labelSize: clampFont(12, fontScale, 1.08),
  };
}
