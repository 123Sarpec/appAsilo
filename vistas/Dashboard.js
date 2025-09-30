import React from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { BarChart, PieChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

// Datos de ejemplo (luego los jalamos de Firestore)
const pacientesStatus = [
  { name: 'Activos', count: 32, color: '#1565C0', legendFontColor: '#333', legendFontSize: 12 },
  { name: 'De Alta', count: 6, color: '#00BFA5', legendFontColor: '#333', legendFontSize: 12 },
  { name: 'Observación', count: 5, color: '#FFB300', legendFontColor: '#333', legendFontSize: 12 },
];

const medicamentosStock = {
  labels: ['Paracetamol', 'Ibuprofeno', 'Omeprazol', 'Metformina', 'Losartán'],
  datasets: [{ data: [120, 80, 55, 90, 40] }],
};

const chartConfig = {
  backgroundGradientFrom: '#FFFFFF',
  backgroundGradientTo: '#FFFFFF',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
  labelColor: () => '#6B7C87',
  barPercentage: 0.6,
};

export default function Dashboard() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Text variant="titleMedium" style={styles.title}>Pacientes por estado</Text>
        <PieChart
          data={pacientesStatus.map(p => ({ name: p.name, population: p.count, color: p.color, legendFontColor: p.legendFontColor, legendFontSize: p.legendFontSize }))}
          width={screenWidth - 32}
          height={220}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="12"
          hasLegend
          chartConfig={chartConfig}
          center={[0, 0]}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="titleMedium" style={styles.title}>Stock de medicamentos</Text>
        <BarChart
          data={medicamentosStock}
          width={screenWidth - 32}
          height={260}
          chartConfig={chartConfig}
          verticalLabelRotation={20}
          style={{ borderRadius: 12 }}
          fromZero
          showValuesOnTopOfBars
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  card: { padding: 12, borderRadius: 16 },
  title: { marginBottom: 8 },
});
