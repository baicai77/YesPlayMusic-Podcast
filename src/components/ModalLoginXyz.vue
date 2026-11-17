<template>
  <Modal
    :show="show"
    :close="close"
    title="登录小宇宙账号"
    width="28rem"
    :show-footer="false"
  >
    <div class="xyz-login-container">
      <div class="desc">
        使用手机号登录小宇宙 FM，同步你的播客订阅、收听进度与收藏。
      </div>

      <details class="session-import">
        <summary>短信受人机验证限制？使用官方网页登录凭证</summary>
        <p
          >先在官方网页完成登录及验证，再手动导入本人凭证。第三方使用可能触发风控，请勿分享
          Token。</p
        >
        <a
          href="https://podcaster.xiaoyuzhoufm.com/"
          target="_blank"
          rel="noopener noreferrer"
          >打开小宇宙官方主播后台</a
        >
        <p
          >登录后按 F12 → Application（应用）→ Cookies → 官方站点，复制下列
          Cookie 的值；不要复制名称或完整 Cookie。</p
        >
        <label for="xyz-access">x-jike-access-token（必填）</label>
        <input
          id="xyz-access"
          v-model="accessToken"
          type="password"
          autocomplete="off"
          class="xyz-input"
          maxlength="16384"
        />
        <label for="xyz-refresh"
          >x-jike-refresh-token（可选，用于自动续期）</label
        >
        <input
          id="xyz-refresh"
          v-model="refreshToken"
          type="password"
          autocomplete="off"
          class="xyz-input"
          maxlength="16384"
        />
        <p
          >验证成功后保存在本应用
          localStorage，并非加密保险箱。未填写刷新凭证时，过期后需重新导入。</p
        >
        <button
          class="login-btn"
          :disabled="loading || !accessToken.trim()"
          @click="submitSession"
          >{{ loading ? '验证中...' : '验证并登录' }}</button
        >
      </details>

      <div class="form-group">
        <label for="xyz-phone">手机号码</label>
        <div class="input-row">
          <input
            id="xyz-phone"
            v-model="phone"
            autocomplete="tel-national"
            type="tel"
            placeholder="请输入大陆手机号"
            class="xyz-input"
            maxlength="11"
          />
        </div>
      </div>

      <div class="form-group">
        <label for="xyz-code">验证码</label>
        <div class="input-row code-row">
          <input
            id="xyz-code"
            v-model="code"
            autocomplete="one-time-code"
            inputmode="numeric"
            type="text"
            placeholder="6位短信验证码"
            class="xyz-input"
            maxlength="6"
            @keydown.enter="submitLogin"
          />
          <button
            class="send-btn"
            :disabled="sending || countingDown || !canSendCode"
            @click="sendVerificationCode"
          >
            {{ countdownText }}
          </button>
        </div>
      </div>

      <div v-if="errorMessage" class="error-msg" role="alert">
        {{ errorMessage }}
      </div>

      <button
        class="login-btn"
        :disabled="loading || !canSubmit"
        @click="submitLogin"
      >
        <span v-if="!loading">登 录</span>
        <span v-else>登录中...</span>
      </button>

      <div class="tips">
        * 登录凭证仅保存在本地客户端，通过内置本地代理与小宇宙官方直连。
      </div>
    </div>
  </Modal>
</template>

<script>
import Modal from '@/components/Modal.vue';
import {
  xyzService,
  xyzErrorMessage,
  importXyzSession,
  setXyzToken,
  setXyzRefreshToken,
  setXyzUser,
} from '@/xyz/client';

export default {
  name: 'ModalLoginXyz',
  components: {
    Modal,
  },
  props: {
    show: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      phone: '',
      code: '',
      accessToken: '',
      refreshToken: '',
      loading: false,
      sending: false,
      countingDown: false,
      countdown: 60,
      timer: null,
      errorMessage: '',
    };
  },
  computed: {
    canSendCode() {
      return /^1[3-9]\d{9}$/.test(this.phone.trim());
    },
    canSubmit() {
      return this.canSendCode && /^\d{4,6}$/.test(this.code.trim());
    },
    countdownText() {
      return this.countingDown ? `${this.countdown}s 后重新发送` : '获取验证码';
    },
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
  methods: {
    async submitSession() {
      if (this.loading || !this.accessToken.trim()) return;
      this.loading = true;
      this.errorMessage = '';
      try {
        const user = await importXyzSession(
          this.accessToken,
          this.refreshToken
        );
        this.$emit('login-success', user);
        this.close();
      } catch (error) {
        this.errorMessage =
          error.response?.status === 401
            ? '凭证无效或已过期，请在官方网页重新登录后再复制'
            : error.response
            ? xyzErrorMessage(error)
            : error.message;
      } finally {
        this.loading = false;
      }
    },
    close() {
      this.accessToken = '';
      this.refreshToken = '';
      this.errorMessage = '';
      this.$emit('update:show', false);
    },
    async sendVerificationCode() {
      if (!this.canSendCode || this.countingDown || this.sending) return;
      this.sending = true;
      this.errorMessage = '';
      try {
        await xyzService.sendCode({
          mobilePhoneNumber: this.phone.trim(),
          areaCode: '+86',
        });
        this.startCountdown();
      } catch (err) {
        this.errorMessage = xyzErrorMessage(err);
      } finally {
        this.sending = false;
      }
    },
    startCountdown() {
      this.countingDown = true;
      this.countdown = 60;
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.countdown -= 1;
        if (this.countdown <= 0) {
          clearInterval(this.timer);
          this.countingDown = false;
        }
      }, 1000);
    },
    async submitLogin() {
      if (!this.canSubmit || this.loading) return;
      this.loading = true;
      this.errorMessage = '';
      try {
        const res = await xyzService.login({
          mobilePhoneNumber: this.phone.trim(),
          verifyCode: this.code.trim(),
          areaCode: '+86',
        });

        if (res?.tokens?.accessToken) {
          setXyzToken(res.tokens.accessToken);
          setXyzRefreshToken(res.tokens.refreshToken || '');
          const user = res.user || res.data?.user || { nickname: '小宇宙用户' };
          setXyzUser(user);
          this.code = '';
          this.$emit('login-success', user);
          this.close();
        } else {
          this.errorMessage = '登录失败：未收到有效凭证';
        }
      } catch (err) {
        this.errorMessage =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          '验证码错误或登录失效';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.xyz-login-container {
  padding: 8px 4px 16px;
  color: var(--color-text);

  .session-import {
    margin-bottom: 24px;
    padding: 12px;
    border-radius: 8px;
    background: var(--color-secondary-bg);
    line-height: 1.6;
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    p {
      margin: 12px 0;
    }
    label {
      display: block;
      margin: 12px 0 6px;
      overflow-wrap: anywhere;
    }
    a {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .xyz-input {
      box-sizing: border-box;
    }
  }

  .desc {
    font-size: 14px;
    opacity: 0.78;
    margin-bottom: 20px;
    line-height: 1.5;
  }

  .form-group {
    margin-bottom: 16px;

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      opacity: 0.88;
    }

    .input-row {
      display: flex;
      align-items: center;

      &.code-row {
        gap: 10px;
      }
    }
  }

  .xyz-input {
    width: 100%;
    height: 42px;
    padding: 0 14px;
    border-radius: 8px;
    font-size: 15px;
    background: var(--color-secondary-bg);
    border: 1px solid transparent;
    color: var(--color-text);
    outline: none;
    transition: all 0.2s ease;

    &:focus {
      border-color: var(--color-primary);
    }
  }

  .send-btn {
    height: 42px;
    padding: 0 16px;
    white-space: nowrap;
    border-radius: 8px;
    border: none;
    background: var(--color-secondary-bg);
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: var(--color-primary-bg);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .error-msg {
    margin-top: 8px;
    font-size: 13px;
    color: #e53e3e;
  }

  .login-btn {
    margin-top: 24px;
    width: 100%;
    height: 44px;
    border-radius: 8px;
    border: none;
    background: var(--color-primary);
    color: white;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .tips {
    margin-top: 16px;
    font-size: 12px;
    opacity: 0.6;
    text-align: center;
    line-height: 1.4;
  }
}
</style>
