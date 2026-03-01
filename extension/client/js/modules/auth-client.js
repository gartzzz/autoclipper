/**
 * Auth Client Module
 * Supabase authentication via REST API (no SDK dependency)
 * Handles signup, login, session refresh, and profile fetching
 */

const AuthClient = {
    // Supabase configuration (anon key is public by design — RLS protects data)
    SUPABASE_URL: 'https://PLACEHOLDER.supabase.co',
    SUPABASE_ANON_KEY: 'PLACEHOLDER',

    // Stripe Payment Links
    STRIPE_MONTHLY_LINK: 'https://buy.stripe.com/PLACEHOLDER_MONTHLY',
    STRIPE_LIFETIME_LINK: 'https://buy.stripe.com/PLACEHOLDER_LIFETIME',

    // State
    _session: null,   // { access_token, refresh_token, expires_at, user: { id, email } }
    _profile: null,   // { id, email, plan, stripe_customer_id }

    // ─── Init ────────────────────────────────────────────────────────────

    /**
     * Initialize: load saved session, try refresh, fetch profile
     * Called once on startup from main.js
     */
    async init() {
        this._loadSession();

        if (!this._session) {
            return; // No session — user is anonymous free tier
        }

        // Refresh if expired or close to expiry (within 60s)
        const now = Math.floor(Date.now() / 1000);
        if (this._session.expires_at && now >= this._session.expires_at - 60) {
            const refreshed = await this.refreshSession();
            if (!refreshed.ok) {
                // Token expired beyond refresh — clear session silently
                this._clearSession();
                return;
            }
        }

        // Fetch profile to get current plan
        await this.getProfile();
    },

    // ─── Auth Methods (GoTrue REST API) ──────────────────────────────────

    /**
     * Sign up with email and password
     * @returns {{ ok: boolean, error?: string }}
     */
    async signUp(email, password, referralCode) {
        try {
            const bodyData = { email, password };
            if (referralCode && referralCode.trim()) {
                bodyData.data = { referred_by: referralCode.trim().toLowerCase() };
            }

            const res = await fetch(`${this.SUPABASE_URL}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.SUPABASE_ANON_KEY
                },
                body: JSON.stringify(bodyData)
            });

            const data = await res.json();

            if (!res.ok) {
                return { ok: false, error: data.error_description || data.msg || 'Error al registrarse' };
            }

            return { ok: true, data };
        } catch (err) {
            return { ok: false, error: 'Error de conexion' };
        }
    },

    /**
     * Sign in with email and password
     * @returns {{ ok: boolean, error?: string }}
     */
    async signIn(email, password) {
        try {
            const res = await fetch(`${this.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                return { ok: false, error: data.error_description || data.msg || 'Credenciales incorrectas' };
            }

            // Store session
            this._session = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + data.expires_in),
                user: data.user ? { id: data.user.id, email: data.user.email } : null
            };
            this._saveSession();

            return { ok: true };
        } catch (err) {
            return { ok: false, error: 'Error de conexion' };
        }
    },

    /**
     * Sign out
     */
    async signOut() {
        try {
            if (this._session?.access_token) {
                await fetch(`${this.SUPABASE_URL}/auth/v1/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this._session.access_token}`,
                        'apikey': this.SUPABASE_ANON_KEY
                    }
                });
            }
        } catch (err) {
            // Ignore errors on logout
        }

        this._clearSession();
    },

    /**
     * Refresh session using refresh token
     * @returns {{ ok: boolean, error?: string }}
     */
    async refreshSession() {
        if (!this._session?.refresh_token) {
            return { ok: false, error: 'No hay sesion' };
        }

        try {
            const res = await fetch(`${this.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ refresh_token: this._session.refresh_token })
            });

            const data = await res.json();

            if (!res.ok) {
                return { ok: false, error: 'Sesion expirada' };
            }

            this._session = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + data.expires_in),
                user: data.user ? { id: data.user.id, email: data.user.email } : this._session.user
            };
            this._saveSession();

            return { ok: true };
        } catch (err) {
            return { ok: false, error: 'Error de conexion' };
        }
    },

    // ─── Profile (PostgREST) ─────────────────────────────────────────────

    /**
     * Fetch user profile from Supabase (plan, stripe info)
     * @returns {{ ok: boolean, error?: string }}
     */
    async getProfile() {
        if (!this._session?.access_token || !this._session?.user?.id) {
            return { ok: false, error: 'No hay sesion' };
        }

        try {
            const res = await fetch(
                `${this.SUPABASE_URL}/rest/v1/profiles?id=eq.${this._session.user.id}&select=*`,
                {
                    headers: {
                        'apikey': this.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${this._session.access_token}`
                    }
                }
            );

            const data = await res.json();

            if (!res.ok || !Array.isArray(data) || data.length === 0) {
                return { ok: false, error: 'Perfil no encontrado' };
            }

            this._profile = data[0];
            return { ok: true, data: this._profile };
        } catch (err) {
            return { ok: false, error: 'Error de conexion' };
        }
    },

    // ─── State Helpers ───────────────────────────────────────────────────

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return !!(this._session?.access_token && this._session?.user);
    },

    /**
     * Get current plan ('free', 'pro', or null if not logged in)
     */
    getPlan() {
        if (!this.isLoggedIn()) return null;
        return this._profile?.plan || 'free';
    },

    /**
     * Check if user has Pro plan
     */
    isPro() {
        return this.getPlan() === 'pro';
    },

    /**
     * Get user object { id, email }
     */
    getUser() {
        return this._session?.user || null;
    },

    /**
     * Get Stripe checkout URL with user info pre-filled
     * @param {'monthly' | 'lifetime'} type
     */
    getCheckoutUrl(type) {
        const link = type === 'lifetime' ? this.STRIPE_LIFETIME_LINK : this.STRIPE_MONTHLY_LINK;
        const user = this.getUser();
        if (!user) return link;
        return `${link}?prefilled_email=${encodeURIComponent(user.email)}&client_reference_id=${user.id}`;
    },

    // ─── Affiliate ───────────────────────────────────────────────────────

    /**
     * Fetch affiliate stats (only works if user is an affiliate)
     */
    async getAffiliateStats() {
        if (!this._session?.access_token) {
            return { ok: false, error: 'No hay sesion' };
        }

        try {
            const res = await fetch(
                `${this.SUPABASE_URL}/functions/v1/affiliate-stats`,
                {
                    headers: {
                        'Authorization': `Bearer ${this._session.access_token}`,
                        'apikey': this.SUPABASE_ANON_KEY
                    }
                }
            );

            const data = await res.json();

            if (!res.ok) {
                return { ok: false, error: data.error || 'Error al obtener estadisticas' };
            }

            return { ok: true, data };
        } catch (err) {
            return { ok: false, error: 'Error de conexion' };
        }
    },

    // ─── Persistence ─────────────────────────────────────────────────────

    _saveSession() {
        if (typeof localStorage !== 'undefined' && this._session) {
            localStorage.setItem('autoclipper_session', JSON.stringify(this._session));
        }
    },

    _loadSession() {
        if (typeof localStorage !== 'undefined') {
            try {
                const saved = localStorage.getItem('autoclipper_session');
                if (saved) {
                    this._session = JSON.parse(saved);
                }
            } catch (err) {
                this._session = null;
            }
        }
    },

    _clearSession() {
        this._session = null;
        this._profile = null;
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('autoclipper_session');
        }
    }
};

// Export for use in CEP
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthClient;
}
