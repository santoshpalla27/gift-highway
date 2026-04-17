package models

import "time"

type Order struct {
	ID            string     `db:"id"`
	OrderNumber   int        `db:"order_number"`
	Title         string     `db:"title"`
	Description   string     `db:"description"`
	CustomerName  string     `db:"customer_name"`
	ContactNumber string     `db:"contact_number"`
	Status        string     `db:"status"`
	Priority      string     `db:"priority"`
	AssignedTo    *string    `db:"assigned_to"`
	CreatedBy     string     `db:"created_by"`
	DueDate       *time.Time `db:"due_date"`
	CreatedAt     time.Time  `db:"created_at"`
	UpdatedAt     time.Time  `db:"updated_at"`
}

type OrderWithNames struct {
	ID            string     `db:"id"`
	OrderNumber   int        `db:"order_number"`
	Title         string     `db:"title"`
	Description   string     `db:"description"`
	CustomerName  string     `db:"customer_name"`
	ContactNumber string     `db:"contact_number"`
	Status        string     `db:"status"`
	Priority      string     `db:"priority"`
	AssignedTo    *string    `db:"assigned_to"`
	CreatedBy     string     `db:"created_by"`
	DueDate       *time.Time `db:"due_date"`
	CreatedAt     time.Time  `db:"created_at"`
	UpdatedAt     time.Time  `db:"updated_at"`
	AssignedName  *string    `db:"assigned_name"`
	CreatedByName string     `db:"created_by_name"`
}
