import { reactive } from 'vue'
import { supabase } from '../supabase'
import type { User } from '@supabase/supabase-js'

export const userStore = reactive({
    user: null as User | null,
    loading: true,

    async initialize() {
        this.loading = true
        const { data: { session } } = await supabase.auth.getSession()
        this.user = session?.user || null
        this.loading = false

        supabase.auth.onAuthStateChange((_event, session) => {
            this.user = session?.user || null
        })
    },

    async signOut() {
        await supabase.auth.signOut()
        this.user = null
    }
})
