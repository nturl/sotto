/**
 * LanguageListScreen — shared body for the three settings language pickers:
 * back link, display title, surface OptionRows (selected = accent left bar).
 */
import { StyleSheet, View } from 'react-native';
import { colors, space } from '@sotto/core/theme';
import { useT, type MessageKey } from '../i18n/useT';
import { BackLink } from './BackLink';
import { localizedName, type LanguageOption } from './languages';
import { OptionRow } from './OptionRow';
import { Shell } from './Shell';
import { Text } from './Text';

export type LanguageListScreenProps = {
  titleKey: MessageKey;
  options: LanguageOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
};

export function LanguageListScreen({ titleKey, options, selectedCode, onSelect }: LanguageListScreenProps) {
  const t = useT();
  return (
    <Shell>
      <BackLink />
      <Text role="display" style={styles.title}>
        {t(titleKey)}
      </Text>
      <View style={styles.list}>
        {options.map((option) => (
          <OptionRow
            key={option.code}
            nativeName={option.nativeName}
            localizedName={localizedName(option)}
            selected={option.code === selectedCode}
            onPress={() => onSelect(option.code)}
          />
        ))}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: space.sm,
    marginBottom: space.xl,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
