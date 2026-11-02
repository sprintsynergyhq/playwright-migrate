describe('Network Stub', () => {
  it('waits for an intercepted request', () => {
    cy.intercept('GET', '**/inventory.html').as('inventory');
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="username"]').type('standard_user');
    cy.get('[data-test="password"]').type('secret_sauce');
    cy.get('[data-test="login-button"]').click();
    cy.wait('@inventory');
    cy.get('[data-test="title"]').should('have.text', 'Products');
  });
});
