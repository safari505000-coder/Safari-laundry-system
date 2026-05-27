import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safariPoliciesHtml } from '@/legal/policies-html';
import { luxury } from '@/design/luxury-tokens';

export default function PoliciesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>رجوع</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>السياسات والأحكام</Text>
          <Text style={styles.subtitle}>مجموعة مصابغ سفاري السريعة</Text>
        </View>
      </View>
      <WebView
        originWhitelist={['*']}
        source={{ html: safariPoliciesHtml }}
        style={styles.webview}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: luxury.color.warmWhite,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: luxury.space.lg,
    paddingBottom: luxury.space.md,
    backgroundColor: luxury.color.warmWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: luxury.color.line,
  },
  backButton: {
    borderRadius: luxury.radius.pill,
    backgroundColor: luxury.color.ice100,
    paddingHorizontal: luxury.space.md,
    paddingVertical: luxury.space.xs,
  },
  backText: {
    color: luxury.color.blue600,
    fontWeight: '900',
  },
  headerText: {
    alignItems: 'flex-end',
    flex: 1,
    marginLeft: luxury.space.md,
  },
  title: {
    color: luxury.color.graphite,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    textAlign: 'right',
  },
  subtitle: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    textAlign: 'right',
  },
  webview: {
    flex: 1,
    backgroundColor: luxury.color.warmWhite,
  },
});
