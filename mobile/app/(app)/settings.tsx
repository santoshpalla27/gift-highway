import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useAuthStore } from '../../store/authStore'
import { authService } from '../../services/authService'

export default function SettingsScreen() {
  const { user, clearAuth } = useAuthStore()

  const handleLogout = async () => {
    try {
      await authService.logout()
    } catch {}
    await clearAuth()
    router.replace('/(auth)/login')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Welcome, {user?.first_name}</Text>
      <Text style={styles.subtitle}>Settings & Options</Text>
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F5F6FA' },
  greeting: { fontSize: 22, fontWeight: '700', color: '#111827', marginTop: 8 },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  logoutBtn: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E6EF',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
})
