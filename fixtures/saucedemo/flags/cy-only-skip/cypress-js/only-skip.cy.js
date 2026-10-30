describe('Only And Skip', () => {
  beforeEach(() => cy.visit('https://www.saucedemo.com/'));

  it.only('shows the login button', () => {
    cy.get('[data-test="login-button"]').should('be.visible');
  });

  it('shows the username field', () => cy.get('[data-test="username"]').should('be.visible'));

  xit('is skipped for now', () => {
    cy.get('[data-test="password"]').should('be.visible');
  });
});
