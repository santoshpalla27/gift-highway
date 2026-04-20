import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { adminService, AdminUser } from '../../services/adminService'
import { router } from 'expo-router'

// ─── Confirm Modal ────────────────────────────────────────────────────────────
interface ConfirmModalProps {
  visible: boolean
  title: string
  message: string
  confirmLabel: string
  confirmColor?: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({ visible, title, message, confirmLabel, confirmColor = '#EF4444', onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={SC.overlay}>
        <View style={SC.dialog}>
          <Text style={SC.dialogTitle}>{title}</Text>
          <Text style={SC.dialogMessage}>{message}</Text>
          <View style={SC.dialogActions}>
            <TouchableOpacity style={SC.cancelBtn} onPress={onCancel}>
              <Text style={SC.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[SC.confirmBtn, { backgroundColor: confirmColor }]} onPress={onConfirm}>
              <Text style={SC.confirmBtnText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function FormField({ label, value, onChangeText, secureTextEntry, autoCapitalize }: any) {
  return (
    <View style={S.fieldBox}>
      <Text style={S.fieldLabel}>{label}</Text>
      <TextInput
        style={S.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
      />
    </View>
  )
}

function RolePicker({ role, setRole }: { role: string; setRole: (r: string) => void }) {
  return (
    <View style={S.fieldBox}>
      <Text style={S.fieldLabel}>Role</Text>
      <View style={S.rolePickerRow}>
        {['user', 'admin'].map((r) => (
          <TouchableOpacity
            key={r}
            style={[S.roleChip, role === r && S.roleChipActive]}
            onPress={() => setRole(r)}
          >
            <Text style={[S.roleChipText, role === r && S.roleChipTextActive]}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

function CreateUserModal({ visible, onClose, onRefresh }: { visible: boolean; onClose: () => void; onRefresh: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name || !email || !password) return Alert.alert('Error', 'All fields are required')
    setLoading(true)
    try {
      await adminService.createUser({ name, email, password, role })
      onRefeshAndClose()
    } catch {
      Alert.alert('Error', 'Could not create user')
    } finally {
      setLoading(false)
    }
  }

  const onRefeshAndClose = () => {
    setName(''); setEmail(''); setPassword(''); setRole('user')
    onRefresh()
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={S.modalContainer}>
        <View style={S.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={S.modalTitle}>Add User</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={S.modalContent} keyboardShouldPersistTaps="handled">
          <FormField label="Full Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
          <FormField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          <RolePicker role={role} setRole={setRole} />
          
          <TouchableOpacity style={S.primaryBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.primaryBtnText}>Create User</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

function EditUserModal({ user, onClose, onRefresh }: { user: AdminUser | null; onClose: () => void; onRefresh: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name)
      setEmail(user.email)
      setRole(user.role)
    }
  }, [user])

  const handleSubmit = async () => {
    if (!user) return
    if (!name || !email) return Alert.alert('Error', 'Name and email are required')
    setLoading(true)
    try {
      await adminService.updateUser(user.id, { name, email, role })
      onRefresh()
      onClose()
    } catch {
      Alert.alert('Error', 'Could not update user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={!!user} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={S.modalContainer}>
        <View style={S.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={S.modalTitle}>Edit User</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={S.modalContent} keyboardShouldPersistTaps="handled">
          <FormField label="Full Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
          <RolePicker role={role} setRole={setRole} />
          
          <TouchableOpacity style={S.primaryBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.primaryBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

function ChangePasswordModal({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!user) return
    if (!password) return Alert.alert('Error', 'Password is required')
    setLoading(true)
    try {
      await adminService.changePassword(user.id, password)
      setPassword('')
      Alert.alert('Success', 'Password updated successfully')
      onClose()
    } catch {
      Alert.alert('Error', 'Could not change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={!!user} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={S.modalContainer}>
        <View style={S.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={S.modalTitle}>Change Password</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={S.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={S.modalSubtext}>Changing password for {user?.name}</Text>
          <FormField label="New Password" value={password} onChangeText={setPassword} secureTextEntry />
          
          <TouchableOpacity style={S.primaryBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={S.primaryBtnText}>Update Password</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [pwdUser, setPwdUser] = useState<AdminUser | null>(null)
  
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [confirmModal, setConfirmModal] = useState<Omit<ConfirmModalProps, 'visible'> | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const data = await adminService.listUsers()
      setUsers(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleToggleActive = (u: AdminUser) => {
    setActiveMenuId(null)
    if (u.is_active) {
      setConfirmModal({
        title: 'Disable User',
        message: `Disable ${u.name}? They will be logged out and won't be able to log in.`,
        confirmLabel: 'Disable',
        confirmColor: '#D97706',
        onConfirm: async () => {
          setConfirmModal(null)
          try { await adminService.disableUser(u.id); fetchUsers() }
          catch { Alert.alert('Error', 'Could not disable user') }
        },
        onCancel: () => setConfirmModal(null),
      })
    } else {
      adminService.enableUser(u.id).then(fetchUsers).catch(() => Alert.alert('Error', 'Could not enable user'))
    }
  }

  const handleDelete = (u: AdminUser) => {
    setActiveMenuId(null)
    setConfirmModal({
      title: 'Delete User',
      message: `Permanently delete ${u.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmColor: '#EF4444',
      onConfirm: async () => {
        setConfirmModal(null)
        try { await adminService.deleteUser(u.id); fetchUsers() }
        catch { Alert.alert('Error', 'Could not delete user') }
      },
      onCancel: () => setConfirmModal(null),
    })
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <View style={S.screen}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Users</Text>
        <TouchableOpacity style={S.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={S.addBtnText}>Add User</Text>
        </TouchableOpacity>
      </View>

      <View style={[S.searchContainer, isSearchFocused && S.searchContainerFocused]}>
        <Ionicons name="search" size={20} color={isSearchFocused ? "#4F46E5" : "#9CA3AF"} />
        <TextInput
          style={S.searchInput}
          placeholder="Search users by name or email…"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{top:10,bottom:10,left:10,right:10}}>
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {loading && users.length === 0 ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : error ? (
        <View style={S.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={S.errorText}>Could not load users.</Text>
          <TouchableOpacity onPress={fetchUsers} style={S.retryBtn}>
            <Text style={S.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={S.list} contentContainerStyle={S.listContent} keyboardShouldPersistTaps="handled">
          {filteredUsers.length === 0 && !loading ? (
            <View style={S.emptyState}>
              <Ionicons name="search-outline" size={48} color="#D1D5DB" />
              <Text style={S.emptyStateTitle}>No users found</Text>
              <Text style={S.emptyStateSub}>Try adjusting your search query, or add a new user.</Text>
            </View>
          ) : (
            filteredUsers.map(u => {
            const isActive = activeMenuId === u.id;
            return (
             <View 
               key={u.id} 
               style={[
                 S.userCard, 
                 isActive && { zIndex: 100, elevation: 10 }
               ]}
             >
               <View style={S.userCardTop}>
                 <View style={S.avatar}>
                   <Text style={S.avatarText}>{getInitials(u.name)}</Text>
                 </View>
                 <View style={S.userInfo}>
                   <Text style={S.userName}>{u.name}</Text>
                   <Text style={S.userEmail}>{u.email}</Text>
                 </View>
                 <TouchableOpacity
                   style={S.menuIcon}
                   onPress={() => setActiveMenuId(activeMenuId === u.id ? null : u.id)}
                 >
                   <Ionicons name="ellipsis-horizontal" size={20} color="#6B7280" />
                 </TouchableOpacity>
               </View>

               <View style={S.userCardBottom}>
                 <View style={[S.badge, u.role === 'admin' ? S.badgeAdmin : S.badgeUser]}>
                   <Text style={[S.badgeText, u.role === 'admin' ? S.badgeTextAdmin : S.badgeTextUser]}>
                     {u.role}
                   </Text>
                 </View>
                 <View style={S.statusRow}>
                   <View style={[S.statusDot, u.is_active ? S.statusActive : S.statusDisabled]} />
                   <Text style={S.statusText}>{u.is_active ? 'Active' : 'Disabled'}</Text>
                 </View>
                 <Text style={S.dateText}>{u.created_at || 'Just now'}</Text>
               </View>

               {/* Dropdown Menu */}
               {activeMenuId === u.id && (
                 <View style={S.menuDropdown}>
                   <TouchableOpacity
                     style={S.menuDropdownItem}
                     onPress={() => { setActiveMenuId(null); setEditUser(u); }}
                   >
                     <Ionicons name="pencil" size={16} color="#374151" />
                     <Text style={S.menuDropdownText}>Edit User</Text>
                   </TouchableOpacity>
                   <TouchableOpacity
                     style={S.menuDropdownItem}
                     onPress={() => { setActiveMenuId(null); setPwdUser(u); }}
                   >
                     <Ionicons name="key" size={16} color="#374151" />
                     <Text style={S.menuDropdownText}>Change Password</Text>
                   </TouchableOpacity>
                   <View style={S.menuDivider} />
                   {u.is_active ? (
                     <TouchableOpacity
                       style={S.menuDropdownItem}
                       onPress={() => handleToggleActive(u)}
                     >
                       <Ionicons name="ban" size={16} color="#D97706" />
                       <Text style={[S.menuDropdownText, { color: '#D97706' }]}>Disable User</Text>
                     </TouchableOpacity>
                   ) : (
                     <TouchableOpacity
                       style={S.menuDropdownItem}
                       onPress={() => handleToggleActive(u)}
                     >
                       <Ionicons name="checkmark-circle" size={16} color="#059669" />
                       <Text style={[S.menuDropdownText, { color: '#059669' }]}>Enable User</Text>
                     </TouchableOpacity>
                   )}
                   <TouchableOpacity
                     style={S.menuDropdownItem}
                     onPress={() => handleDelete(u)}
                   >
                     <Ionicons name="trash" size={16} color="#EF4444" />
                     <Text style={[S.menuDropdownText, { color: '#EF4444' }]}>Delete Permanently</Text>
                   </TouchableOpacity>
                 </View>
               )}
             </View>
            )
          })
          )}
        </ScrollView>
      )}

      {/* Modals */}
      <CreateUserModal visible={showCreate} onClose={() => setShowCreate(false)} onRefresh={fetchUsers} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} onRefresh={fetchUsers} />
      <ChangePasswordModal user={pwdUser} onClose={() => setPwdUser(null)} />
      <ConfirmModal visible={!!confirmModal} {...(confirmModal ?? { title: '', message: '', confirmLabel: '', onConfirm: () => {}, onCancel: () => {} })} />
    </View>
  )
}

// ─── Confirm Modal Styles ─────────────────────────────────────────────────────
const SC = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  dialogMessage: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
    marginBottom: 24,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#374151',
    marginTop: 12,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    position: 'relative',
    elevation: 1,
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  userEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  menuIcon: {
    padding: 8,
    marginRight: -8,
  },
  userCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeAdmin: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#E0E7FF' },
  badgeUser: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  badgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  badgeTextAdmin: { color: '#4F46E5' },
  badgeTextUser: { color: '#4B5563' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusActive: { backgroundColor: '#10B981' },
  statusDisabled: { backgroundColor: '#9CA3AF' },
  statusText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  dateText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500', marginLeft: 'auto' },

  // Dropdown Menu
  menuDropdown: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 100,
    minWidth: 160,
    padding: 4,
  },
  menuDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  menuDropdownText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalContent: {
    padding: 16,
  },
  modalSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  fieldBox: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  roleChipActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  roleChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  roleChipTextActive: {
    color: '#4F46E5',
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease',
      } as any,
      default: {},
    }),
  },
  searchContainerFocused: {
    borderColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
      default: {},
    }),
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
})
