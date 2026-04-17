import { apiClient } from './apiClient'

export interface Profile {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  avatar_url?: string
}

export const profileService = {
  getProfile: async (): Promise<Profile> => {
    const res = await apiClient.get<{ profile: Profile }>('/profile/me')
    return res.data.profile
  },

  getAvatarUploadURL: async (filename: string, contentType: string) => {
    const res = await apiClient.post<{ upload_url: string; object_key: string }>(
      '/profile/avatar/upload-url',
      { filename, content_type: contentType }
    )
    return res.data
  },

  confirmAvatarUpload: async (objectKey: string): Promise<{ signed_url: string }> => {
    const res = await apiClient.patch<{ signed_url: string }>('/profile/avatar', { object_key: objectKey })
    return res.data
  },

  getAvatarSignedURL: async (): Promise<string | null> => {
    try {
      const res = await apiClient.get<{ signed_url: string }>('/profile/avatar/signed-url')
      return res.data.signed_url
    } catch {
      return null
    }
  },
}
