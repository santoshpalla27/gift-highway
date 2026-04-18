package models

import (
	"time"

	"github.com/lib/pq"
)

type Order struct {
	ID            string     `db:"id"`
	OrderNumber   int        `db:"order_number"`
	Title         string     `db:"title"`
	Description   string     `db:"description"`
	CustomerName  string     `db:"customer_name"`
	ContactNumber string     `db:"contact_number"`
	Status        string     `db:"status"`
	Priority      string     `db:"priority"`
	CreatedBy     string     `db:"created_by"`
	DueDate       *time.Time `db:"due_date"`
	CreatedAt     time.Time  `db:"created_at"`
	UpdatedAt     time.Time  `db:"updated_at"`
}

type OrderWithNames struct {
	ID            string         `db:"id"`
	OrderNumber   int            `db:"order_number"`
	Title         string         `db:"title"`
	Description   string         `db:"description"`
	CustomerName  string         `db:"customer_name"`
	ContactNumber string         `db:"contact_number"`
	Status        string         `db:"status"`
	Priority      string         `db:"priority"`
	CreatedBy     string         `db:"created_by"`
	DueDate       *time.Time     `db:"due_date"`
	CreatedAt     time.Time      `db:"created_at"`
	UpdatedAt     time.Time      `db:"updated_at"`
	AssignedTo    pq.StringArray `db:"assigned_to"`
	AssignedNames pq.StringArray `db:"assigned_names"`
	CreatedByName string         `db:"created_by_name"`
}
