import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  CinematicOrb,
  FadeIn,
  GlassPanel,
  LuxuryButton,
  LuxuryScreen,
  LuxuryScroll,
} from '@/design/luxury-system';
import { luxury } from '@/design/luxury-tokens';

export default function LuxuryPrototypeScreen() {
  return (
    <LuxuryScreen>
      <CinematicOrb size={240} style={styles.orbTop} />
      <LuxuryScroll>
        <FadeIn>
          <View style={styles.hero}>
            <Text style={styles.brand}>Safari Laundry Group</Text>
            <Text style={styles.heroTitle}>راحة فندقية، لملابسك اليومية</Text>
            <Text style={styles.heroCopy}>
              اطلب العناية بملابسك كما لو كانت خدمة فندقية خاصة. يصل فريق سفاري
              بهدوء، ويتابع طلبك حتى يعود إليك بأفضل صورة.
            </Text>
          </View>
        </FadeIn>

        <FadeIn delay={90}>
          <GlassPanel style={styles.pickupCard}>
            <Text style={styles.pickupKicker}>استلام منسّق بعناية</Text>
            <Text style={styles.pickupTitle}>فريق سفاري يصل في الوقت المناسب</Text>
            <Text style={styles.pickupCopy}>
              حدّد الموعد. نرتب تفاصيل الطلب من الباب، ونعيده إليك بعناية.
            </Text>
            <LuxuryButton
              label="رتّب الاستلام"
              icon="arrow-back"
              onPress={() => router.push('/(tabs)/services')}
            />
          </GlassPanel>
        </FadeIn>

        <FadeIn delay={140}>
          <GlassPanel style={styles.trackingPanel}>
            <Text style={styles.sectionEyebrow}>ORDER TRACKING</Text>
            <Text style={styles.sectionTitle}>تتبّع أنيق، بدون توتر</Text>
            <View style={styles.timeline}>
              <View style={styles.timelineLine} />
              <View style={styles.timelineItem}>
                <View style={styles.timelineDotActive} />
                <View style={styles.timelineText}>
                  <Text style={styles.timelineTitle}>تم الاستلام</Text>
                  <Text style={styles.timelineCopy}>وصلت القطع إلى مركز العناية</Text>
                </View>
              </View>
              <View style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineText}>
                  <Text style={styles.timelineTitle}>العناية والتنظيف</Text>
                  <Text style={styles.timelineCopy}>فحص، تنظيف، وكي نهائي</Text>
                </View>
              </View>
              <View style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineText}>
                  <Text style={styles.timelineTitle}>العودة إليك</Text>
                  <Text style={styles.timelineCopy}>تسليم مرتب في الوقت المحدد</Text>
                </View>
              </View>
            </View>
          </GlassPanel>
        </FadeIn>

        <FadeIn delay={240}>
          <View style={styles.footerStatement}>
            <Text style={styles.footerText}>
              سفاري ليس متجر خدمات. سفاري تجربة عناية هادئة تبدأ من باب منزلك.
            </Text>
          </View>
        </FadeIn>
      </LuxuryScroll>
    </LuxuryScreen>
  );
}

const styles = StyleSheet.create({
  orbTop: {
    top: -80,
    right: -90,
  },
  hero: {
    minHeight: 300,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: luxury.space.md,
    paddingTop: luxury.space.xxl,
  },
  brand: {
    color: luxury.color.champagne,
    fontSize: luxury.type.caption,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'right',
  },
  heroTitle: {
    color: luxury.color.graphite,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -1.3,
  },
  heroCopy: {
    color: luxury.color.slate,
    fontSize: 17,
    lineHeight: 27,
    textAlign: 'right',
    maxWidth: 340,
  },
  pickupCard: {
    backgroundColor: luxury.color.warmWhite,
    gap: luxury.space.md,
  },
  pickupKicker: {
    color: luxury.color.blue600,
    fontSize: luxury.type.caption,
    fontWeight: '900',
    textAlign: 'right',
  },
  pickupTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.section,
    lineHeight: luxury.lineHeight.section,
    fontWeight: '900',
    textAlign: 'right',
  },
  pickupCopy: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    lineHeight: luxury.lineHeight.body,
    textAlign: 'right',
  },
  sectionEyebrow: {
    color: luxury.color.champagne,
    fontSize: luxury.type.micro,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'right',
  },
  sectionTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.section,
    fontWeight: '900',
    textAlign: 'right',
  },
  trackingPanel: {
    backgroundColor: luxury.color.navy900,
  },
  timeline: {
    gap: luxury.space.md,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    right: 9,
    top: 18,
    bottom: 18,
    width: 1,
    backgroundColor: 'rgba(251,250,247,0.16)',
  },
  timelineItem: {
    flexDirection: 'row-reverse',
    gap: luxury.space.md,
    alignItems: 'flex-start',
  },
  timelineDotActive: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: luxury.color.champagne,
    marginTop: 4,
  },
  timelineDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(251,250,247,0.22)',
    marginTop: 4,
  },
  timelineText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  timelineTitle: {
    color: luxury.color.warmWhite,
    fontSize: luxury.type.body,
    fontWeight: '900',
    textAlign: 'right',
  },
  timelineCopy: {
    color: 'rgba(251,250,247,0.66)',
    fontSize: luxury.type.callout,
    lineHeight: luxury.lineHeight.callout,
    textAlign: 'right',
  },
  footerStatement: {
    paddingHorizontal: luxury.space.md,
    paddingBottom: luxury.space.xl,
  },
  footerText: {
    color: luxury.color.slate,
    fontSize: luxury.type.callout,
    lineHeight: 24,
    textAlign: 'center',
  },
});
