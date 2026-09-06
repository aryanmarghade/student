export type ApiRole = 'super_admin' | 'teacher' | 'student'

export type SessionUser = {
  id: string
  collegeId: string
  role: ApiRole
  email: string
}

export type LoginResponse = {
  accessToken: string
  user: SessionUser
}

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const body = await response.json() as { error?: string; accessToken?: string; user?: SessionUser }
  if (!response.ok || !body.accessToken || !body.user) {
    throw new Error(body.error ?? 'Unable to sign in')
  }
  return { accessToken: body.accessToken, user: body.user }
}
