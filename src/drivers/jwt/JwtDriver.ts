import { inject, injectable } from "inversify";
import ConfigInterface from "varie/lib/config/ConfigInterface";
import HttpServiceInterface from "varie/lib/http/HttpServiceInterface";
import StateServiceInterface from "varie/lib/state/StateServiceInterface";
import AuthenticationDriverInterface from "../AuthenticationDriverInterface";
import StorageServiceInterface from "varie/lib/storage/StorageServiceInterface";

@injectable()
export default class JwtDriver implements AuthenticationDriverInterface {
  private $store;
  private authService;
  private httpService;
  private configService;
  private storageService;

  protected storagePath;

  constructor(
    @inject("AuthService") authService,
    @inject("ConfigService") configService: ConfigInterface,
    @inject("HttpService") httpService: HttpServiceInterface,
    @inject("StateService") stateService: StateServiceInterface,
    @inject("StorageService") storageService: StorageServiceInterface
  ) {
    this.httpService = httpService;
    this.authService = authService;
    this.configService = configService;
    this.storageService = storageService;
    this.$store = stateService.getStore();
    this.storagePath = this.authService.getGuardConfig("storagePath");
  }

  public async loginResponse(response) {
    this.setAuthToken(response);
    return await this.$store.dispatch("auth/getUser");
  }

  public async logoutResponse(response) {
    this.removeAuthToken();
  }

  public async refreshResponse(response) {
    this.setAuthToken(response);
  }

  public async registerResponse(response) {
    if (this.authService.getGuardConfig("loginAfterRegister")) {
      this.setAuthToken(response);
      return await this.$store.dispatch("auth/getUser");
    }
  }

  public async resetPasswordResponse(response) {
    if (this.authService.getGuardConfig("loginAfterReset")) {
      this.setAuthToken(response);
      return await this.$store.dispatch("auth/getUser");
    }
  }

  public async isLoggedIn(guard) {
    if (this.$store.getters["auth/user"](guard)) {
      return true;
    }

    if (this.storageService.get(this.storagePath)) {
      return await this.$store.dispatch("auth/getUser").then(
        () => {
          return true;
        },
        () => {
          return false;
        }
      );
    }

    return false;
  }

  public async middlewareRequest(config) {
    let token = JSON.parse(this.storageService.get(this.storagePath));
    if (token) {
      if (
        !config.url.includes(
          this.authService.getGuardConfig("endpoints.refresh")
        ) &&
        token.expires_at < new Date().getTime()
      ) {
        this.authService.refresh().then(
          () => {
            token = JSON.parse(this.storageService.get(this.storagePath));
            config.headers.common.Authorization = `${token.token_type} ${
              token.access_token
            }`;
            return config;
          },
          () => {
            this.removeAuthToken();
            return config;
          }
        );
      } else {
        config.headers.common.Authorization = `${token.token_type} ${
          token.access_token
        }`;
        return config;
      }
    } else {
      return config;
    }
  }

  public async middlewareResponse(response) {
    return response;
  }

  private setAuthToken(response) {
    this.storageService.set(
      this.storagePath,
      JSON.stringify({
        access_token:
          response.data[this.authService.getGuardConfig("token.accessToken")],
        token_type:
          response.data[this.authService.getGuardConfig("token.tokenTypeName")],
        expires_at:
          new Date().getTime() +
          1000 *
            response.data[this.authService.getGuardConfig("token.expiresIn")]
      })
    );
  }

  private removeAuthToken() {
    this.storageService.remove(this.storagePath);
  }
}
