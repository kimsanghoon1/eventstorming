<template>
  <div class="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark group/design-root overflow-x-hidden font-display">
    <div class="flex flex-1 w-full">
      <div class="grid grid-cols-1 md:grid-cols-2 flex-1">
        <!-- Left side illustration -->
        <div class="relative hidden h-full w-full flex-col items-center justify-center bg-background-dark p-10 md:flex">
          <div class="absolute inset-0 z-0">
            <img class="h-full w-full object-cover opacity-20" data-alt="Abstract fluid art background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCuqNXz3dCDsehCL-MHDeEJWcY0riEkHA87iw6ku_ayJFdm6rfEM4fiubPkrYtzhiFr2eYfs30g9NTRgG66H0EDm9MmLPuUe6xU0NHItRimoSBi0MWaJt9jXI5pbavOAlqG2QUKuiHlzzRlKtQL9BC5nqSWtDaJ7m8P6oP7yfD9OdIKtT4TVKY2-eVcL9C8TcC8JjMwOnVtWxC4owSeqY4icmLhQrj9goZzs-NuxtTPx2IJwkvhylp3GOgZL2OmeTDVDEpRR4BJ6CY"/>
          </div>
          <div class="relative z-10 flex flex-col items-start text-white max-w-md">
            <div class="flex items-center gap-3 pb-4">
              <span class="material-symbols-outlined text-primary" style="font-size: 40px;">schema</span>
              <span class="text-3xl font-bold">FlowCraft</span>
            </div>
            <h2 class="text-4xl font-bold leading-tight tracking-tight text-white/90">Visualize, Collaborate, Create.</h2>
            <p class="mt-4 text-lg text-white/70">Bring your ideas to life with real-time diagramming and collaborative eventstorming.</p>
          </div>
        </div>
        <!-- Right side login form -->
        <div class="flex w-full items-center justify-center bg-background-light dark:bg-background-dark p-6 sm:p-8 lg:p-12">
          <div class="flex w-full max-w-md flex-col items-center">
            <div class="flex items-center gap-2 pb-8 text-slate-800 dark:text-white md:hidden">
              <span class="material-symbols-outlined text-primary" style="font-size: 32px;">schema</span>
              <span class="text-2xl font-bold">FlowCraft</span>
            </div>
            <div class="flex w-full flex-col">
              <h1 class="text-slate-900 dark:text-white text-3xl font-bold pb-2">{{ isSignUpMode ? 'Create an account' : 'Welcome back' }}</h1>
              <p class="text-slate-600 dark:text-slate-400 text-base pb-8">{{ isSignUpMode ? 'Sign up to get started.' : 'Log in to continue to your dashboard.' }}</p>
              
              <form @submit.prevent="handleAuth" class="w-full space-y-4">
                <label class="flex flex-col flex-1">
                  <p class="text-slate-900 dark:text-white text-sm font-medium pb-2">Email</p>
                  <input v-model="email" required type="email" class="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1c2427] h-12 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-3 text-base" placeholder="you@example.com"/>
                </label>
                <label class="flex flex-col flex-1">
                  <div class="flex items-center justify-between pb-2">
                    <p class="text-slate-900 dark:text-white text-sm font-medium">Password</p>
                    <a v-if="!isSignUpMode" class="text-primary text-sm font-medium underline hover:no-underline" href="#">Forgot Password?</a>
                  </div>
                  <div class="relative flex w-full items-center">
                    <input v-model="password" required :type="showPassword ? 'text' : 'password'" class="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1c2427] h-12 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-3 pr-10 text-base" placeholder="Enter your password"/>
                    <button type="button" @click="showPassword = !showPassword" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary">
                      <span class="material-symbols-outlined" style="font-size: 20px;">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
                    </button>
                  </div>
                </label>
                
                <div v-if="errorMessage" class="p-3 text-sm text-red-500 bg-red-100 dark:bg-red-900/20 rounded-lg">
                  {{ errorMessage }}
                </div>

                <div class="pt-6">
                  <button type="submit" :disabled="loading" class="flex w-full min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary hover:bg-primary/90 text-slate-900 text-base font-bold leading-normal tracking-[0.015em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <span v-if="loading" class="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                    <span class="truncate">{{ isSignUpMode ? 'Sign Up' : 'Log In' }}</span>
                  </button>
                </div>
              </form>

              <div class="relative flex items-center py-6">
                <div class="flex-grow border-t border-slate-300 dark:border-slate-700"></div>
                <span class="mx-4 flex-shrink text-xs font-medium uppercase text-slate-500 dark:text-slate-400">OR</span>
                <div class="flex-grow border-t border-slate-300 dark:border-slate-700"></div>
              </div>
              <div class="space-y-3">
                <button @click="signInWithProvider('google')" class="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1c2427] px-4 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.578 12.261C22.578 11.451 22.506 10.665 22.374 9.9H12.204V14.331H18.156C17.886 15.867 17.07 17.163 15.816 18.069V20.661H19.65C21.534 18.981 22.578 15.933 22.578 12.261Z" fill="#4285F4"></path><path d="M12.204 23.0002C15.228 23.0002 17.748 22.0412 19.65 20.6612L15.816 18.0692C14.808 18.7352 13.596 19.1612 12.204 19.1612C9.396 19.1612 6.996 17.2892 6.108 14.6852H2.148V17.3612C4.056 20.8172 7.824 23.0002 12.204 23.0002Z" fill="#34A853"></path><path d="M6.10781 14.6851C5.86181 13.9831 5.72381 13.2331 5.72381 12.4651C5.72381 11.6971 5.86181 10.9471 6.10781 10.2451V7.56909H2.14781C1.44581 8.94909 1.00003 10.6591 1.00003 12.4651C1.00003 14.2711 1.44581 15.9811 2.14781 17.3611L6.10781 14.6851Z" fill="#FBBC05"></path><path d="M12.204 5.76901C13.716 5.76901 15.06 6.27301 16.128 7.28101L19.728 3.86101C17.748 1.99501 15.228 1.00003 12.204 1.00003C7.824 1.00003 4.056 3.18301 2.148 6.63901L6.108 9.31501C6.996 6.71101 9.396 5.76901 12.204 5.76901Z" fill="#EA4335"></path></svg>
                  <span>Continue with Google</span>
                </button>
                <button @click="signInWithProvider('github')" class="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1c2427] px-4 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <svg class="h-5 w-5 fill-slate-800 dark:fill-slate-200" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z" fill-rule="evenodd"></path></svg>
                  <span>Continue with GitHub</span>
                </button>
              </div>
              <div class="pt-8 text-center">
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  {{ isSignUpMode ? 'Already have an account?' : "Don't have an account?" }}
                  <a href="#" @click.prevent="toggleMode" class="font-medium text-primary hover:underline">
                    {{ isSignUpMode ? 'Log In' : 'Sign Up' }}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase'

const router = useRouter()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const isSignUpMode = ref(false)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const toggleMode = () => {
  isSignUpMode.value = !isSignUpMode.value
  errorMessage.value = null
  password.value = ''
}

const handleAuth = async () => {
  loading.value = true
  errorMessage.value = null

  try {
    if (isSignUpMode.value) {
      const { error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      alert('Sign up successful! Please check your email for verification.')
      isSignUpMode.value = false // Switch to login mode
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      router.push('/')
    }
  } catch (error: any) {
    console.error('Authentication error:', error.message)
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

const signInWithProvider = async (provider: 'google' | 'github') => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin
    }
  })
  if (error) {
    console.error('Error signing in:', error.message)
    errorMessage.value = 'Error signing in: ' + error.message
  }
}
</script>
