import { View, Text, StyleSheet } from 'react-native'

export default function AllOrdersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>All Orders</Text>
      <Text style={styles.subtitle}>Empty UI state - identical to web</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F5F6FA', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  title: { 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#111827' 
  },
  subtitle: { 
    fontSize: 14, 
    color: '#6B7280', 
    marginTop: 8 
  }
})
