import {
  Text,
  View
} from 'react-native';

import { useSettings } from '../settings/SettingsContext';
import styles from '../styles';

export default function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel(theme)}>{label}</Text>
      <Text style={styles.metricValue(theme)}>{value}</Text>
    </View>
  );
}