describe('Custom Command', () => {
  it('logs in with a custom command', () => {
    cy.visit('https://www.saucedemo.com/');
    cy.login('standard_user', 'secret_sauce');
    cy.get('[data-test="title"]').should('have.text', 'Products');
  });
});
