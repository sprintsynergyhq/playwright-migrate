describe('Dropped Test', () => {
  it('shows the login button', () => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="login-button"]').should('be.visible');
  });

  it('uses a done callback', (done) => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="username"]').should('be.visible');
    done();
  });
});
