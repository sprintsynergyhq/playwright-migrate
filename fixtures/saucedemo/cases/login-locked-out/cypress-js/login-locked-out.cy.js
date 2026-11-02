describe('Login', () => {
  it('shows an error for the locked out user', () => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="username"]').type('locked_out_user');
    cy.get('[data-test="password"]').type('secret_sauce');
    cy.get('[data-test="login-button"]').click();
    cy.get('[data-test="error"]').should('be.visible');
    cy.get('[data-test="error"]').should('contain', 'Sorry, this user has been locked out.');
  });
});
