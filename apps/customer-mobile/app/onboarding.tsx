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
import { writeOnboardingCompleted } from '@/auth/customer-session';

const steps = [
  ['استلام من الباب', 'اختر الموعد، ونصل إليك بهدوء.'],
  ['عناية واضحة', 'تابع طلبك من الاستلام حتى التسليم.'],
  ['دفع ودعم', 'فواتيرك ودعم سفاري في مكان واحد.'],
] as const;

export default function OnboardingScreen() {
  async function finish() {
    await writeOnboardingCompleted();
    router.replace('/(tabs)');
  }

  return (
    <LuxuryScreen>
      <CinematicOrb size={260} style={styles.orbTop} />
      <LuxuryScroll contentContainerStyle={styles.wrap}>
        <FadeIn>
          <View style={styles.hero}>
            <Text style={styles.brand}>Safari Laundry Group</Text>
            <Text style={styles.title}>راحة فندقية، من أول طلب</Text>
            <Text style={styles.copy}>
              تجربة عناية بالملابس مصممة لتكون هادئة، واضحة، وسهلة.
            </Text>
          </View>
        </FadeIn>
        <GlassPanel>
          {steps.map(([title, copy]) => (
            <View key={title} style={styles.step}>
              <Text style={styles.stepTitle}>{title}</Text>
              <Text style={styles.stepCopy}>{copy}</Text>
            </View>
          ))}
          <LuxuryButton label="ابدأ التجربة" icon="arrow-back" onPress={() => void finish()} />
        </GlassPanel>
      </LuxuryScroll>
    </LuxuryScreen>
  );
}

const styles = StyleSheet.create({
  orbTop: { top: -80, right: -90 },
  wrap: { gap: luxury.space.xl },
  hero: {
    minHeight: 320,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: luxury.space.md,
  },
  brand: {
    color: luxury.color.champagne,
    fontSize: luxury.type.caption,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: luxury.color.graphite,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '900',
    textAlign: 'right',
  },
  copy: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    lineHeight: luxury.lineHeight.body,
    textAlign: 'right',
  },
  step: {
    alignItems: 'flex-end',
    gap: 2,
    paddingVertical: luxury.space.xs,
  },
  stepTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    textAlign: 'right',
  },
  stepCopy: {
    color: luxury.color.slate,
    fontSize: luxury.type.callout,
    lineHeight: luxury.lineHeight.callout,
    textAlign: 'right',
  },
});
