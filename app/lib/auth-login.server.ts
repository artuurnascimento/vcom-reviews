import { LoginErrorType, type LoginError } from "@shopify/shopify-app-remix/server";

export type LoginErrorMessage = {
  shop?: string;
};

export function loginErrorMessage(loginErrors: LoginError): LoginErrorMessage {
  if (loginErrors.shop === LoginErrorType.MissingShop) {
    return { shop: "Informe o domínio da loja para entrar." };
  }
  if (loginErrors.shop === LoginErrorType.InvalidShop) {
    return { shop: "Domínio inválido. Use o formato sua-loja.myshopify.com" };
  }
  return {};
}
