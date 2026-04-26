import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, G } from 'react-native-svg'
import { useNotifications } from '../../hooks/useNotifications'
import { useNotifPreference } from '../../hooks/useNotifPreference'
import { usePushToken } from '../../hooks/usePushToken'

function GiftHighwayHeaderLogo() {
  return (
    <View style={headerStyles.logoWrap}>
      <Svg viewBox="0 0 100 100" width={32} height={32} fill="none">
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
      <View style={headerStyles.textWrap}>
        <Text style={headerStyles.logoText}>
          <Text style={{ color: '#F0914A' }}>Gift</Text> Highway
        </Text>
        <Text style={headerStyles.logoSubText}>
          ENRICHING EVERY MOMENT
        </Text>
      </View>
    </View>
  )
}

function NotificationIcon() {
  const router = useRouter()
  const { scope } = useNotifPreference()
  const { totalCount: myCount } = useNotifications({ mineOnly: true })
  const { totalCount: otherCount } = useNotifications({ othersOnly: true })
  const badgeCount = scope === 'all_orders' ? myCount + otherCount : myCount

  return (
    <TouchableOpacity
      style={headerStyles.iconBtn}
      activeOpacity={0.7}
      onPress={() => router.push('/notifications' as any)}
    >
      <Ionicons name="notifications-outline" size={24} color="#111827" />
      {badgeCount > 0 && (
        <View style={headerStyles.badge}>
          <Text style={headerStyles.badgeText}>
            {badgeCount > 99 ? '99+' : String(badgeCount)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function AppLayout() {
  usePushToken()
  const insets = useSafeAreaInsets()
  const tabBarHeight = 62 + insets.bottom

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6366F1', // Premium Indigo
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: '#E5E7EB',
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
          elevation: 5,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 4,
        },
        headerStyle: {
          backgroundColor: '#FFFFFF',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#E4E6EF',
        },
        headerTitle: '',
        headerLeft: () => <GiftHighwayHeaderLogo />,
        headerRight: () => <NotificationIcon />,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-orders"
        options={{
          tabBarLabel: 'My Orders',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="all-orders"
        options={{
          tabBarLabel: 'All Orders',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ href: null, title: 'Notifications' }}
      />
      <Tabs.Screen
        name="notification-preferences"
        options={{ href: null, title: 'Notification Preferences' }}
      />
      <Tabs.Screen
        name="settings-admin"
        options={{
          href: null,
          title: 'Admin Panel',
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{ href: null, title: 'Activity' }}
      />
      <Tabs.Screen
        name="trash"
        options={{ href: null, title: 'Trash' }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  )
}

const headerStyles = StyleSheet.create({
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 8,
  },
  textWrap: {
    justifyContent: 'center',
    transform: [{ translateY: 1 }],
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e1b4b',
    letterSpacing: -0.5,
    lineHeight: 20,
  },
  logoSubText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1.5,
    marginTop: 1,
  },
  iconBtn: {
    paddingRight: 16,
    paddingLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 12,
    minWidth: 16,
    height: 16,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 11,
  },
})
