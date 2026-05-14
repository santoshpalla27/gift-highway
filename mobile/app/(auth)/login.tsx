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
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle, Path, G } from 'react-native-svg'
import { authService } from '../../services/authService'
import { useAuthStore } from '../../store/authStore'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const response = await authService.login({ email, password })
      await setAuth(response.user, response.tokens.access_token, response.tokens.refresh_token)
      router.replace('/(app)')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e?.response?.data?.error ?? 'Invalid email or password.')
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
            {/* Inline error */}
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={[styles.input, error && !password ? styles.inputError : null]}
                value={email}
                onChangeText={(v) => { setEmail(v); setError('') }}
                placeholder="name@company.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput, error ? styles.inputError : null]}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError('') }}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(p => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
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
    alignSelf: 'center',
  },
  header: { alignItems: 'center', marginBottom: 32 },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -1.5,
  },
  subtitle: { fontSize: 15, color: '#64748B', marginTop: 4 },
  formContainer: { width: '100%' },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  // Inline error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, fontWeight: '500', color: '#DC2626', flex: 1 },

  field: { marginBottom: 16 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  inputError: { borderColor: '#FCA5A5' },

  // Password field with visibility toggle
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
  },

  button: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  footerText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
})
