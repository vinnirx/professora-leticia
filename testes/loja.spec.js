import { test, expect } from "@playwright/test";

test("a vitrine abre com as atividades", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.getByRole("heading", { name: "Materiais em destaque" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver Atividade" }).first()).toBeVisible();
  const caixa = await page.locator("body").boundingBox();
  const rolagem = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(caixa?.width).toBeGreaterThan(0);
  expect(rolagem).toBeLessThan(8);
});

test("entrar oferece a recuperação de senha", async ({ page }) => {
  await page.goto("/entrar.html");
  await page.getByRole("button", { name: "Esqueci a senha" }).click();
  await expect(page.getByRole("button", { name: "Enviar link" })).toBeVisible();
});

test("link de senha vencido avisa na tela", async ({ page }) => {
  await page.goto("/entrar.html#error_code=otp_expired");
  await expect(page.getByText("Esse link expirou. Peça outro.")).toBeVisible();
});

test("a ficha mostra o preço e o botão de compra", async ({ page }) => {
  await page.goto("/atividade.html?id=adicao");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Adição");
  await expect(page.getByText("R$ 9,90").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar ao carrinho" })).toBeVisible();
});

test("o carrinho abre e o CPF fica oculto", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Carrinho", exact: true }).click();
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
  await expect(page.locator("#campo-documento")).toBeHidden();
  const rolagem = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(rolagem).toBeLessThan(8);
});

test("entrar mostra o login e o cadastro sem enviar dados", async ({ page }) => {
  await page.goto("/entrar.html");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByRole("button", { name: "Criar uma conta" }).click();
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
});

test("finalizar o carrinho sem sessão não cria pedido", async ({ page }) => {
  await page.goto("/atividade.html?id=silabas");
  await page.getByRole("button", { name: "Adicionar ao carrinho" }).click();
  await expect(page.getByText("Seu carrinho está vazio.")).toBeHidden();
  await page.getByRole("button", { name: "Finalizar compra" }).click();
  await expect(page).toHaveURL(/entrar\.html/);
  await expect(page.locator("#campo-documento")).toHaveCount(0);
});

test("minha conta sem sessão pede para entrar", async ({ page }) => {
  await page.goto("/minhas.html");
  await expect(page.getByText("Entre para ver as atividades que você comprou.")).toBeVisible();
  const rolagem = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(rolagem).toBeLessThan(8);
});

test("painel sem sessão não abre a equipe", async ({ page }) => {
  await page.goto("/admin.html");
  await expect(page.locator("#painel-app")).toBeHidden();
  await expect(page.locator("#conciliacao")).toBeHidden();
  await expect(page.locator("#financeiro-inicio")).toBeHidden();
  await expect(page.locator("#equipe-aviso")).toBeHidden();
});
