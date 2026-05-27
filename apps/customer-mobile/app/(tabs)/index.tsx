import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useOrderCart } from '@/cart/order-cart';
import {
  CinematicOrb,
  FadeIn,
  GlassPanel,
  LuxuryButton,
  LuxuryScreen,
  LuxuryScroll,
} from '@/design/luxury-system';
import { luxury } from '@/design/luxury-tokens';

export default function HomeScreen() {
  const { totalItems: cartCount } = useOrderCart();

  return (
    <LuxuryScreen>
      <CinematicOrb size={240} style={styles.orbTop} />
      <LuxuryScroll contentContainerStyle={styles.wrap}>
      <FadeIn>
        <View style={styles.hero}>
          <Text style={styles.brand}>Safari Laundry Group</Text>
          <Text style={styles.heroTitle}>راحة فندقية، لملابسك اليومية</Text>
          <Text style={styles.heroCopy}>
            اطلب العناية بملابسك كما لو كانت خدمة فندقية خاصة. يصل فريق سفاري
            بهدوء، ويتابع طلبك بعناية حتى يعود إليك بأفضل صورة.
          </Text>
        </View>
      </FadeIn>

      <FadeIn delay={90}>
        <GlassPanel style={styles.pickupCard}>
          <Text style={styles.pickupKicker}>تجربة عناية من الباب</Text>
          <Text style={styles.pickupTitle}>اختر الخدمة، واترك الباقي علينا.</Text>
          <Text style={styles.pickupCopy}>
            قائمة الخدمات في تبويب مستقل حتى تبقى الرئيسية هادئة وواضحة.
          </Text>
          <LuxuryButton
            label="استعراض الخدمات"
            icon="arrow-back"
            onPress={() => router.push('/(tabs)/services')}
          />
          {cartCount > 0 ? (
            <LuxuryButton
              label={`أكمل الطلب · ${cartCount}`}
              variant="secondary"
              onPress={() => router.push('/(tabs)/order')}
            />
          ) : null}
        </GlassPanel>
      </FadeIn>
      </LuxuryScroll>
    </LuxuryScreen>
  );
}

const styles = StyleSheet.create({
  orbTop: { top: -80, right: -90 },
  wrap: { gap: luxury.space.xl },
  hero: {
    minHeight: 330,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: luxury.space.md,
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
    letterSpacing: -1.2,
  },
  heroCopy: {
    color: luxury.color.slate,
    fontSize: 17,
    lineHeight: 27,
    textAlign: 'right',
  },
  pickupCard: { backgroundColor: luxury.color.warmWhite },
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
});
