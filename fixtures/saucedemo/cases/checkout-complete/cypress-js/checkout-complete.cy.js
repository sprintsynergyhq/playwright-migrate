describe('Checkout', () => {
  it('completes checkout for one item', () => {
    cy.visit('https://www.saucedemo.com/');
    cy.get('[data-test="username"]').type('standard_user');
    cy.get('[data-test="password"]').type('secret_sauce');
    cy.get('[data-test="login-button"]').click();
    cy.get('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    cy.get('[data-test="shopping-cart-link"]').click();
    cy.get('[data-test="checkout"]').click();
    cy.get('[data-test="firstName"]').type('Ada');
    cy.get('[data-test="lastName"]').type('Lovelace');
    cy.get('[data-test="postalCode"]').type('10001');
    cy.get('[data-test="continue"]').click();
    cy.url().should('include', '/checkout-step-two.html');
    cy.get('[data-test="finish"]').click();
    cy.url().should('include', '/checkout-complete.html');
    cy.get('[data-test="complete-header"]').should('have.text', 'Thank you for your order!');
  });
});
