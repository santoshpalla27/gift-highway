import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import Svg, { Circle, Path, G } from 'react-native-svg'
import { authService } from '../../services/authService'
import { useAuthStore } from '../../store/authStore'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password')
      return
    }

    setLoading(true)
    try {
      const response = await authService.login({ email, password })
      await setAuth(response.user, response.tokens.access_token, response.tokens.refresh_token)
      router.replace('/(app)')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      Alert.alert('Login Failed', error?.response?.data?.error ?? 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Branding */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Svg viewBox="0 0 100 100" width={48} height={48} fill="none">
              <Circle cx="50" cy="50" r="50" fill="#F0914A" />
              <G stroke="#1e1b4b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M 16 28 H 25 L 34 62 H 70 L 78 38 H 28" />
                <Circle cx="40" cy="75" r="5" fill="none" />
                <Circle cx="64" cy="75" r="5" fill="none" />
                <Path d="M 38 32 H 68 V 39 H 38 Z" fill="#F0914A" />
                <Path d="M 42 39 V 56 H 64 V 39" fill="#F0914A" />
                <Path d="M 53 32 V 56" />
                <Path d="M 53 32 C 45 18 36 24 44 32" fill="#F0914A" />
                <Path d="M 53 32 C 61 18 70 24 62 32" fill="#F0914A" />
              </G>
            </Svg>
            <Text style={styles.logoText}>
              <Text style={{ color: '#F0914A' }}>Gift</Text> Highway
            </Text>
          </View>
          <Text style={styles.subtitle}>Sign in to your workspace</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="name@company.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholderTextColor="#5A5A72"
              />
            </View>

            <View style={styles.field}>
              <View style={styles.passwordHeader}>
                <Text style={styles.label}>Password</Text>
                <TouchableOpacity>

                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="current-password"
                placeholderTextColor="#5A5A72"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
          
          <Text style={styles.footerText}>
            Internal use only — unauthorized access is prohibited
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  inner: { 
    flex: 1, 
    justifyContent: 'center', 
    paddingHorizontal: 24, 
    maxWidth: 440, 
    width: '100%', 
    alignSelf: 'center' 
  },
  header: { alignItems: 'center', marginBottom: 32 },
  logoContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 12, 
    marginBottom: 12 
  },
  logoText: { 
    fontSize: 32, 
    fontWeight: '800', 
    color: '#111827', 
    letterSpacing: -1.5 
  },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  formContainer: { width: '100%' },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: '#E4E6EF',
  },
  field: { marginBottom: 20 },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { 
    fontSize: 11, 
    fontWeight: '700', 
    color: '#9CA3AF', 
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6 
  },
  forgotText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366F1',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E4E6EF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#F0F1F5',
  },
  button: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  footerText: { 
    textAlign: 'center', 
    marginTop: 24, 
    fontSize: 11, 
    color: '#9CA3AF' 
  },
})
