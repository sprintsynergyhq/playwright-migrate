describe('Sorting', () => {
  beforeEach(() => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="username"]').type('standard_user');
    cy.get('[data-test="password"]').type('secret_sauce');
    cy.get('[data-test="login-button"]').click();
  });

  it('sorts products by price, low to high', () => {
    cy.get('[data-test="product-sort-container"]').select('lohi');
    cy.get('[data-test="product-sort-container"]').should('have.value', 'lohi');
    cy.get('[data-test="inventory-item-price"]').first().should('have.text', '$7.99');
    cy.get('[data-test="inventory-item-price"]').last().should('have.text', '$49.99');
  });
});
