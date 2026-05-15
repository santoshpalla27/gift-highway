import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
} from 'react-native'
import { useEffect, useRef, useState, useCallback } from 'react'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../../store/authStore'
import { authService } from '../../../services/authService'
import { profileService, Profile } from '../../../services/profileService'

// ─── Skeleton Pulse ────────────────────────────────────────────────────────────
function SkeletonBlock({ width, height, borderRadius = 8 }: { width: number | `${number}%`; height: number; borderRadius?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [anim])
  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: '#E5E7EB' },
        { opacity: anim },
      ]}
    />
  )
}

// ─── Role Chip ─────────────────────────────────────────────────────────────────
function RoleChip({ role }: { role: string }) {
  const isAdmin = role === 'admin'
  return (
    <View style={[S.chip, isAdmin ? S.chipAdmin : S.chipUser]}>
      <View style={[S.chipDot, { backgroundColor: isAdmin ? '#F0914A' : '#10B981' }]} />
      <Text style={[S.chipText, { color: isAdmin ? '#c45f00' : '#065F46' }]}>
        {isAdmin ? 'Admin' : role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={S.card}>
      <Text style={S.cardLabel}>{label}</Text>
      {children}
    </View>
  )
}

// ─── Settings Row ─────────────────────────────────────────────────────────────
function SettingsRow({
  icon,
  iconBg,
  iconColor,
  label,
  subtitle,
  onPress,
  danger = false,
  disabled = false,
  rightContent,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  iconBg: string
  iconColor?: string
  label: string
  subtitle?: string
  onPress?: () => void
  danger?: boolean
  disabled?: boolean
  rightContent?: React.ReactNode
}) {
  const opacity = useRef(new Animated.Value(1)).current
  const handlePress = () => {
    if (!onPress || disabled) return
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.6, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start()
    onPress()
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={disabled ? 1 : 0.7}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={[S.row, { opacity }]}>
        <View style={[S.rowIcon, { backgroundColor: iconBg }]}>
          <Ionicons
            name={icon}
            size={18}
            color={iconColor ?? '#FFFFFF'}
          />
        </View>
        <View style={S.rowBody}>
          <Text style={[S.rowLabel, danger && { color: '#EF4444' }, disabled && S.rowLabelDisabled]}>
            {label}
          </Text>
          {subtitle ? (
            <Text style={S.rowSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {rightContent ?? (
          !disabled && onPress ? (
            <Ionicons name="chevron-forward" size={16} color="#C6C6C8" />
          ) : disabled ? (
            <View style={S.comingSoonBadge}>
              <Text style={S.comingSoonText}>Soon</Text>
            </View>
          ) : null
        )}
      </Animated.View>
    </TouchableOpacity>
  )
}

// ─── Avatar Section ────────────────────────────────────────────────────────────
function AvatarSection({
  profile,
  avatarUrl,
  initials,
  uploading,
  onPressAvatar,
  avatarUploadEnabled,
}: {
  profile: Profile | null
  avatarUrl: string | null
  initials: string
  uploading: boolean
  onPressAvatar: () => void
  avatarUploadEnabled: boolean
}) {
  return (
    <View style={S.profileHero}>
      <TouchableOpacity
        onPress={avatarUploadEnabled ? onPressAvatar : undefined}
        activeOpacity={avatarUploadEnabled ? 0.8 : 1}
        style={S.avatarWrap}
        accessibilityRole={avatarUploadEnabled ? 'button' : undefined}
        accessibilityLabel={avatarUploadEnabled ? 'Change profile photo' : undefined}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={S.avatarImg} />
        ) : (
          <View style={S.avatarFallback}>
            <Text style={S.avatarInitials}>{initials}</Text>
          </View>
        )}
        {/* Camera badge only shown when upload is actually enabled */}
        {avatarUploadEnabled && (
          <View style={S.avatarBadge}>
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="camera" size={13} color="#FFFFFF" />
            )}
          </View>
        )}
      </TouchableOpacity>

      <View style={S.profileInfo}>
        {profile ? (
          <>
            <Text style={S.profileName}>
              {profile.first_name} {profile.last_name}
            </Text>
            <Text style={S.profileEmail}>{profile.email}</Text>
            <View style={{ marginTop: 10 }}>
              <RoleChip role={profile.role} />
            </View>
          </>
        ) : (
          <>
            <SkeletonBlock width={160} height={22} borderRadius={6} />
            <View style={{ marginTop: 8 }}>
              <SkeletonBlock width={220} height={16} borderRadius={4} />
            </View>
            <View style={{ marginTop: 10 }}>
              <SkeletonBlock width={70} height={22} borderRadius={99} />
            </View>
          </>
        )}
      </View>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { user, clearAuth, refreshToken } = useAuthStore()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Avatar upload is disabled until expo-image-picker is installed
  const avatarUploadEnabled = false

  const isAdmin = (profile?.role ?? user?.role) === 'admin'
  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : '??'

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true)
    setFetchError(false)
    try {
      const p = await profileService.getProfile()
      setProfile(p)
      if (p.avatar_url) {
        const url = await profileService.getAvatarSignedURL()
        setAvatarUrl(url)
      }
    } catch {
      setFetchError(true)
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleAvatarPress = async () => {
    // TODO: Re-enable once expo-image-picker is installed
  }

  const handleLogout = async () => {
    const performLogout = async () => {
      try {
        await authService.logout(refreshToken ?? '')
      } catch {}
      await clearAuth()
      router.replace('/(auth)/login')
    }

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        performLogout()
      }
    } else {
      Alert.alert('Sign out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: performLogout },
      ])
    }
  }

  return (
    <ScrollView
      style={S.screen}
      contentContainerStyle={[S.scrollContent, { paddingBottom: Math.max(insets.bottom + 16, 40) }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={S.pageHeader}>
        <Text style={S.pageTitle}>Settings</Text>
        <Text style={S.pageSubtitle}>Manage your account and preferences</Text>
      </View>

      <SectionCard label="PROFILE">
        <AvatarSection
          profile={profile}
          avatarUrl={avatarUrl}
          initials={initials}
          uploading={uploading}
          onPressAvatar={handleAvatarPress}
          avatarUploadEnabled={avatarUploadEnabled}
        />

        <View style={S.divider} />

        {loadingProfile && !fetchError ? (
          <View style={{ gap: 18, paddingVertical: 4 }}>
            {[200, 160, 100].map((w, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonBlock width={80} height={14} />
                <SkeletonBlock width={w} height={14} />
              </View>
            ))}
          </View>
        ) : fetchError ? (
          <View style={S.errorBox}>
            <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
            <Text style={S.errorText}>Could not load profile.</Text>
            <TouchableOpacity onPress={fetchProfile} style={S.retryBtn}>
              <Text style={S.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={S.detailsList}>
            {[
              { label: 'Full Name', value: `${profile?.first_name} ${profile?.last_name}` },
              { label: 'Email', value: profile?.email ?? '—' },
              { label: 'Role', value: (profile?.role ?? '—').charAt(0).toUpperCase() + (profile?.role ?? '').slice(1) },
            ].map(({ label, value }) => (
              <View key={label} style={S.detailRow}>
                <Text style={S.detailLabel}>{label}</Text>
                <Text style={S.detailValue} numberOfLines={1}>{value}</Text>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard label="TOOLS">
        <SettingsRow
          icon="pulse-outline"
          iconBg="#6366F1"
          label="Notifications"
          subtitle="All order events"
          onPress={() => router.push('/(app)/settings/activity' as never)}
        />
        {isAdmin && (
          <>
            <View style={S.rowSep} />
            <SettingsRow
              icon="trash-outline"
              iconBg="#9CA3AF"
              label="Trash"
              subtitle="Archived orders"
              onPress={() => router.push('/(app)/settings/trash' as never)}
            />
          </>
        )}
      </SectionCard>

      {isAdmin && (
        <SectionCard label="ADMIN PANEL">
          <SettingsRow
            icon="people-outline"
            iconBg="#F0914A"
            label="Admin Dashboard"
            subtitle="Manage users and access"
            onPress={() => router.push('/(app)/settings/settings-admin' as never)}
          />
          <View style={S.rowSep} />
          <SettingsRow
            icon="bar-chart-outline"
            iconBg="#6366F1"
            label="User Metrics"
            subtitle="Order stats per team member"
            onPress={() => router.push('/(app)/settings/admin-metrics' as never)}
          />
          <View style={S.rowSep} />
          <SettingsRow
            icon="document-text-outline"
            iconBg="#10B981"
            label="Activity Log"
            subtitle="All order events log"
            onPress={() => router.push('/(app)/settings/activity-log' as never)}
          />
          <View style={S.rowSep} />
          <SettingsRow
            icon="shield-checkmark-outline"
            iconBg="#16A34A"
            label="Audit Log"
            subtitle="CSV export & R2 status"
            onPress={() => router.push('/(app)/settings/audit' as never)}
          />
        </SectionCard>
      )}

      <SectionCard label="ACCOUNT">
        {/* danger row: white icon on red background for proper contrast */}
        <SettingsRow
          icon="log-out-outline"
          iconBg="#EF4444"
          iconColor="#FFFFFF"
          label="Sign Out"
          danger
          onPress={handleLogout}
        />
      </SectionCard>

      <View style={S.footer}>
        <Text style={S.footerText}>Gift Highway</Text>
      </View>
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  pageHeader: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 4,
  },
  avatarWrap: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '700',
    color: '#4F46E5',
    letterSpacing: -0.5,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0914A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    gap: 5,
  },
  chipAdmin: { backgroundColor: '#FFF7ED' },
  chipUser:  { backgroundColor: '#ECFDF5' },
  chipDot:   { width: 6, height: 6, borderRadius: 3 },
  chipText:  { fontSize: 12, fontWeight: '700' },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F3F4F6',
    marginBottom: 14,
  },

  detailsList: { gap: 0 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: { fontSize: 14, fontWeight: '500', color: '#6B7280' },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#111827', maxWidth: '60%', textAlign: 'right' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    minHeight: 44,
  },
  rowSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F3F4F6',
    marginLeft: 46,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: '#111827' },
  rowLabelDisabled: { color: '#9CA3AF' },
  rowSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  comingSoonBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.3,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  errorText: { fontSize: 14, color: '#EF4444', flex: 1 },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FEE2E2', borderRadius: 8 },
  retryText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },

  footer: { alignItems: 'center', paddingTop: 8 },
  footerText: { fontSize: 12, color: '#C6C6C8', fontWeight: '500' },
})
