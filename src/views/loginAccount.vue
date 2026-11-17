<template>
  <div class="login">
    <div class="login-container">
      <div class="section-1">
        <img src="/img/logos/netease-music.png" />
      </div>
      <div class="title">{{ $t('login.loginText') }}</div>
      <div class="section-2">
        <div v-show="mode === 'phone'" class="input-box">
          <div
            class="container"
            :class="{ active: ['phone', 'countryCode'].includes(inputFocus) }"
          >
            <svg-icon icon-class="mobile" />
            <div class="inputs">
              <input
                id="countryCode"
                v-model="countryCode"
                :placeholder="
                  inputFocus === 'countryCode' ? '' : $t('login.countryCode')
                "
                @focus="inputFocus = 'countryCode'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
              <input
                id="phoneNumber"
                v-model="phoneNumber"
                :placeholder="inputFocus === 'phone' ? '' : $t('login.phone')"
                @focus="inputFocus = 'phone'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>

        <div v-show="mode === 'email'" class="input-box">
          <div class="container" :class="{ active: inputFocus === 'email' }">
            <svg-icon icon-class="mail" />
            <div class="inputs">
              <input
                id="email"
                v-model="email"
                type="email"
                :placeholder="inputFocus === 'email' ? '' : $t('login.email')"
                @focus="inputFocus = 'email'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>
        <div v-show="mode !== 'qrCode'" class="input-box">
          <div class="container" :class="{ active: inputFocus === 'password' }">
            <svg-icon icon-class="lock" />
            <div class="inputs">
              <input
                id="password"
                v-model="password"
                type="password"
                :placeholder="
                  inputFocus === 'password' ? '' : $t('login.password')
                "
                @focus="inputFocus = 'password'"
                @blur="inputFocus = ''"
                @keyup.enter="login"
              />
            </div>
          </div>
        </div>

        <div v-show="mode == 'qrCode'">
          <div v-show="qrCodeSvg" class="qr-code-container">
            <img :src="qrCodeSvg" loading="lazy" />
          </div>
          <div class="qr-code-info" role="status" aria-live="polite">
            {{ qrCodeInformation }}
          </div>
          <button :disabled="processing" @click="getQrCodeKey"
            >刷新二维码</button
          >
        </div>
      </div>
      <div v-show="mode !== 'qrCode'" class="confirm">
        <button v-show="!processing" @click="login">
          {{ $t('login.login') }}
        </button>
        <button v-show="processing" class="loading" disabled>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
      <div class="other-login">
        <a v-show="mode !== 'email'" @click="changeMode('email')">{{
          $t('login.loginWithEmail')
        }}</a>
        <span v-show="mode === 'qrCode'">|</span>
        <a v-show="mode !== 'phone'" @click="changeMode('phone')">{{
          $t('login.loginWithPhone')
        }}</a>
        <span v-show="mode !== 'qrCode'">|</span>
        <a v-show="mode !== 'qrCode'" @click="changeMode('qrCode')">
          二维码登录
        </a>
      </div>
      <div
        v-show="mode !== 'qrCode'"
        class="notice"
        v-html="isElectron ? $t('login.noticeElectron') : $t('login.notice')"
      ></div>
    </div>
  </div>
</template>

<script>
import QRCode from 'qrcode';
import md5 from 'crypto-js/md5';
import NProgress from 'nprogress';
import { mapMutations } from 'vuex';
import { setCookies, getCookie } from '@/utils/auth';
import nativeAlert from '@/utils/nativeAlert';
import {
  loginWithPhone,
  loginWithEmail,
  loginQrCodeKey,
  loginQrCodeCheck,
} from '@/api/auth';

export default {
  name: 'Login',
  data() {
    return {
      processing: false,
      mode: 'qrCode',
      countryCode: '+86',
      phoneNumber: '',
      email: '',
      password: '',
      smsCode: '',
      inputFocus: '',
      qrCodeKey: '',
      qrCodeSvg: '',
      qrCodeCheckInterval: null,
      qrChecking: false,
      qrCodeInformation: '打开网易云音乐APP扫码登录',
    };
  },
  computed: {
    isElectron() {
      return process.env.IS_ELECTRON;
    },
  },
  created() {
    if (['phone', 'email', 'qrCode'].includes(this.$route.query.mode)) {
      this.mode = this.$route.query.mode;
    }
    this.getQrCodeKey();
  },
  beforeDestroy() {
    clearInterval(this.qrCodeCheckInterval);
  },
  methods: {
    ...mapMutations(['updateData']),
    validatePhone() {
      if (
        this.countryCode === '' ||
        this.phone === '' ||
        this.password === ''
      ) {
        nativeAlert('国家区号或手机号不正确');
        this.processing = false;
        return false;
      }
      return true;
    },
    validateEmail() {
      const emailReg =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      if (
        this.email === '' ||
        this.password === '' ||
        !emailReg.test(this.email)
      ) {
        nativeAlert('邮箱不正确');
        return false;
      }
      return true;
    },
    login() {
      if (this.mode === 'phone') {
        this.processing = this.validatePhone();
        if (!this.processing) return;
        loginWithPhone({
          countrycode: this.countryCode.replace('+', '').replace(/\s/g, ''),
          phone: this.phoneNumber.replace(/\s/g, ''),
          password: 'fakePassword',
          md5_password: md5(this.password).toString(),
        })
          .then(this.handleLoginResponse)
          .catch(error => {
            this.processing = false;
            nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
          });
      } else {
        this.processing = this.validateEmail();
        if (!this.processing) return;
        loginWithEmail({
          email: this.email.replace(/\s/g, ''),
          password: 'fakePassword',
          md5_password: md5(this.password).toString(),
        })
          .then(this.handleLoginResponse)
          .catch(error => {
            this.processing = false;
            nativeAlert(`发生错误，请检查你的账号密码是否正确\n${error}`);
          });
      }
    },
    async handleLoginResponse(data) {
      this.processing = true;
      try {
        if (data?.code !== 200)
          throw new Error(data?.msg || data?.message || '登录失败，请重试');
        setCookies(data.cookie);
        if (!getCookie('MUSIC_U'))
          throw new Error('未收到账号登录凭证，请重新扫码');
        this.updateData({ key: 'loginMode', value: 'account' });
        await this.$store.dispatch('fetchUserProfile');
        if (!this.$store.state.data.user?.userId)
          throw new Error('获取账号资料失败，请刷新二维码重试');
        await this.$store.dispatch('fetchLikedPlaylist').catch(() => {
          this.$store.dispatch(
            'showToast',
            '登录成功，歌单暂未加载，可稍后重试'
          );
        });
        await this.$router.push({ path: '/library' });
      } catch (error) {
        this.qrCodeInformation = error.message || '登录失败，请刷新二维码重试';
        this.$store.dispatch('showToast', this.qrCodeInformation);
      } finally {
        this.processing = false;
      }
    },
    async getQrCodeKey() {
      clearInterval(this.qrCodeCheckInterval);
      this.qrCodeKey = '';
      this.qrCodeSvg = '';
      this.qrCodeInformation = '正在生成二维码...';
      try {
        const result = await loginQrCodeKey();
        if (result?.code !== 200 || !result.data?.unikey)
          throw new Error('二维码生成失败，请点击刷新');
        this.qrCodeKey = result.data.unikey;
        const svg = await QRCode.toString(
          `https://music.163.com/login?codekey=${this.qrCodeKey}`,
          {
            width: 192,
            margin: 0,
            color: { dark: '#335eea', light: '#00000000' },
            type: 'svg',
          }
        );
        this.qrCodeSvg = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        this.qrCodeInformation = '打开网易云音乐APP扫码，并在手机上确认登录';
        if (this.mode === 'qrCode') this.checkQrCodeLogin();
      } catch (error) {
        this.qrCodeInformation = '二维码加载失败，请检查网络后点击刷新';
      } finally {
        NProgress.done();
      }
    },
    checkQrCodeLogin() {
      clearInterval(this.qrCodeCheckInterval);
      this.qrCodeCheckInterval = setInterval(async () => {
        if (!this.qrCodeKey || this.qrChecking || this.processing) return;
        const key = this.qrCodeKey;
        this.qrChecking = true;
        try {
          const result = await loginQrCodeCheck(key);
          if (key !== this.qrCodeKey || this.mode !== 'qrCode') return;
          const code = Number(result?.code);
          if (code === 800) {
            clearInterval(this.qrCodeCheckInterval);
            this.qrCodeInformation = '二维码已失效，请点击刷新后重新扫码';
          } else if (code === 802) {
            this.qrCodeInformation = '扫描成功，请在手机上确认登录';
          } else if (code === 801) {
            this.qrCodeInformation = '打开网易云音乐APP扫码登录';
          } else if (code === 803) {
            clearInterval(this.qrCodeCheckInterval);
            this.qrCodeInformation = '已确认，正在获取账号资料...';
            await this.handleLoginResponse({ ...result, code: 200 });
          } else {
            this.qrCodeInformation = '登录状态获取失败，请刷新二维码重试';
          }
        } catch (error) {
          this.qrCodeInformation = '连接失败，正在重试；也可点击刷新二维码';
        } finally {
          this.qrChecking = false;
        }
      }, 1500);
    },
    changeMode(mode) {
      this.mode = mode;
      if (mode === 'qrCode') this.getQrCodeKey();
      else clearInterval(this.qrCodeCheckInterval);
    },
  },
};
</script>

<style lang="scss" scoped>
.login {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 32px;
}

.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 48px;
  color: var(--color-text);
}

.section-1 {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  img {
    height: 64px;
    margin: 20px;
    user-select: none;
  }
}

.section-2 {
  display: flex;
  align-items: center;
  flex-direction: column;
}

.input-box {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
  color: var(--color-text);

  .container {
    display: flex;
    align-items: center;
    height: 46px;
    background: var(--color-secondary-bg);
    border-radius: 8px;
    width: 300px;
  }

  .svg-icon {
    height: 18px;
    width: 18px;
    color: #aaaaaa;
    margin: {
      left: 12px;
      right: 6px;
    }
  }

  .inputs {
    display: flex;
    width: 85%;
  }

  input {
    font-size: 20px;
    border: none;
    background: transparent;
    width: 100%;
    font-weight: 600;
    margin-top: -1px;
    color: var(--color-text);
  }

  input::placeholder {
    color: var(--color-text);
    opacity: 0.38;
  }

  input#countryCode {
    flex: 3;
  }
  input#phoneNumber {
    flex: 12;
  }

  .active {
    background: var(--color-primary-bg);
    input,
    .svg-icon {
      color: var(--color-primary);
    }
  }
}

.confirm button {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: 8px;
  margin-top: 24px;
  transition: 0.2s;
  padding: 8px;
  width: 100%;
  width: 300px;
  &:hover {
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.94);
  }
}

.other-login {
  margin-top: 24px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.68;
  a {
    padding: 0 8px;
  }
}

.notice {
  width: 300px;
  border-top: 1px solid rgba(128, 128, 128);
  margin-top: 48px;
  padding-top: 12px;
  font-size: 12px;
  color: var(--color-text);
  opacity: 0.48;
}

@keyframes loading {
  0% {
    opacity: 0.2;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0.2;
  }
}

button.loading {
  height: 44px;
  cursor: unset;
  &:hover {
    transform: none;
  }
}
.loading span {
  width: 6px;
  height: 6px;
  background-color: var(--color-primary);
  border-radius: 50%;
  margin: 0 2px;
  animation: loading 1.4s infinite both;
}

.loading span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading span:nth-child(3) {
  animation-delay: 0.4s;
}

.qr-code-container {
  background-color: var(--color-primary-bg);
  padding: 24px 24px 21px 24px;
  border-radius: 1.25rem;
  margin-bottom: 12px;
}
.qr-code-info {
  color: var(--color-text);
  text-align: center;
  margin-bottom: 28px;
}
</style>
